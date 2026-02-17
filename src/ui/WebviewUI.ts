/**
 * WebviewUI — Task/Response wrapper for VS Code Webview panels.
 *
 * Provides an API backwards-compatible with vscode.window.showQuickPick / showInputBox
 * but renders inside a webview panel. Also exposes rich task types like showVerseSelector.
 *
 * The extension always drives the control flow via sequential `await` calls.
 * The webview is a stateless render-and-respond terminal.
 * Panel close at any point resolves the pending promise to undefined/null (cancel).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
    WebviewQuickPickItem,
    VerseSelectorItem,
    VerseSelectorOptions,
    VerseSelectionResult,
    ConfirmationPageData,
    JobDetailData,
    JobDetailAction,
    WebviewTask,
    WebviewMessage,
} from '../types/ui';

/**
 * Manages a webview panel and provides an await-based task/response API.
 */
export class WebviewUI {
    private panel: vscode.WebviewPanel;
    private disposed = false;
    private taskCounter = 0;
    private pendingResolve: ((value: any) => void) | null = null;
    private pendingTaskId: string | null = null;
    private messageDisposable: vscode.Disposable | null = null;

    constructor(
        private extensionUri: vscode.Uri,
        private workspaceRoot?: string,
        private panelTitle: string = 'New GPU Job',
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'codexWorkerPanel',
            this.panelTitle,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    // Allow access to project attachments for audio playback
                    ...(workspaceRoot ? [vscode.Uri.file(path.join(workspaceRoot, '.project', 'attachments'))] : []),
                ],
            }
        );

        // Set the HTML content
        this.panel.webview.html = this.getHtmlContent();

        // Handle panel disposal (user closes the tab)
        this.panel.onDidDispose(() => {
            this.disposed = true;
            if (this.pendingResolve) {
                this.pendingResolve(undefined);
                this.pendingResolve = null;
                this.pendingTaskId = null;
            }
            if (this.messageDisposable) {
                this.messageDisposable.dispose();
                this.messageDisposable = null;
            }
        });

        // Set up message listener
        this.messageDisposable = this.panel.webview.onDidReceiveMessage(
            (msg: any) => {
                // Handle audio URI requests (non-task messages)
                if (msg.type === 'get-audio-uri' && msg.filePath) {
                    const fileUri = vscode.Uri.file(msg.filePath);
                    const webviewUri = this.panel.webview.asWebviewUri(fileUri);
                    this.panel.webview.postMessage({
                        type: 'audio-uri',
                        uri: webviewUri.toString(),
                        requestId: msg.requestId,
                    });
                    return;
                }

                if (!this.pendingResolve || !this.pendingTaskId) {
                    return;
                }
                if (msg.type === 'response' && msg.taskId === this.pendingTaskId) {
                    const resolve = this.pendingResolve;
                    this.pendingResolve = null;
                    this.pendingTaskId = null;
                    resolve(msg.result);
                } else if (msg.type === 'cancel' && msg.taskId === this.pendingTaskId) {
                    const resolve = this.pendingResolve;
                    this.pendingResolve = null;
                    this.pendingTaskId = null;
                    resolve(undefined);
                }
            }
        );
    }

    /**
     * Whether the panel has been disposed (closed by user or programmatically)
     */
    get isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Dispose the panel
     */
    dispose(): void {
        if (!this.disposed) {
            this.panel.dispose();
        }
    }

    /**
     * Send a task to the webview and wait for the response.
     * Returns undefined if the panel is closed before a response.
     */
    private async askWebview<T>(taskPayload: Record<string, any>): Promise<T | undefined> {
        if (this.disposed) {
            return undefined;
        }

        const taskId = `task_${++this.taskCounter}`;
        const fullTask = { type: 'task', taskId, ...taskPayload };

        return new Promise<T | undefined>((resolve) => {
            this.pendingResolve = resolve;
            this.pendingTaskId = taskId;
            this.panel.webview.postMessage(fullTask);
        });
    }

    // ================================================================
    // Backwards-compatible API (mirrors vscode.window.showQuickPick / showInputBox)
    // ================================================================

    /**
     * Show a QuickPick-like selection in the webview.
     * API shape mirrors vscode.window.showQuickPick for easy migration.
     */
    async showQuickPick(
        items: WebviewQuickPickItem[],
        options?: { title?: string; placeHolder?: string }
    ): Promise<WebviewQuickPickItem | undefined> {
        return this.askWebview<WebviewQuickPickItem>({
            taskType: 'quickpick',
            items,
            title: options?.title,
            placeHolder: options?.placeHolder,
        });
    }

    /**
     * Show an InputBox-like text input in the webview.
     * API shape mirrors vscode.window.showInputBox for easy migration.
     *
     * Note: validateInput callbacks can't be sent to the webview, so we use
     * validationRegex + validationMessage for simple validation, or skip it.
     */
    async showInputBox(
        options?: {
            title?: string;
            prompt?: string;
            value?: string;
            placeHolder?: string;
            validationRegex?: string;
            validationMessage?: string;
        }
    ): Promise<string | undefined> {
        return this.askWebview<string>({
            taskType: 'inputbox',
            title: options?.title,
            prompt: options?.prompt,
            value: options?.value,
            placeHolder: options?.placeHolder,
            validationRegex: options?.validationRegex,
            validationMessage: options?.validationMessage,
        });
    }

    // ================================================================
    // Rich task types (no native equivalent)
    // ================================================================

    /**
     * Show the interactive verse selector.
     * Returns the selected cell IDs, or undefined if canceled.
     */
    async showVerseSelector(
        verses: VerseSelectorItem[],
        options: VerseSelectorOptions
    ): Promise<VerseSelectionResult | undefined> {
        return this.askWebview<VerseSelectionResult>({
            taskType: 'verse-selector',
            verses,
            phase: options.phase,
            selectionMode: options.selectionMode,
            showHideRecorded: options.showHideRecorded,
            showPlayButton: options.showPlayButton,
            allowSkip: options.allowSkip,
        });
    }

    /**
     * Show the audio reference selector.
     * Returns the selected audio path (pointers/ path for GPU worker),
     * null if skipped, or undefined if canceled.
     */
    async showAudioReferenceSelector(
        verses: VerseSelectorItem[]
    ): Promise<string | null | undefined> {
        const result = await this.askWebview<VerseSelectionResult>({
            taskType: 'verse-selector',
            verses,
            phase: 'Reference Audio',
            selectionMode: 'single-audio',
            showHideRecorded: false,
            showPlayButton: true,
            allowSkip: true,
        });

        if (!result) {
            return undefined; // Canceled
        }

        if (result.selectedIds.length === 0) {
            return null; // Skipped
        }

        return result.selectedAudioPath || null;
    }

    /**
     * Show the confirmation/review page.
     * Returns 'submit', 'start-over', or undefined (canceled/closed).
     */
    async showConfirmation(
        data: ConfirmationPageData
    ): Promise<'submit' | 'start-over' | undefined> {
        return this.askWebview<'submit' | 'start-over'>({
            taskType: 'confirmation',
            data,
        });
    }

    /**
     * Show the job detail view with action buttons.
     * Returns the action the user clicked, or undefined if the panel was closed.
     */
    async showJobDetail(
        data: JobDetailData
    ): Promise<JobDetailAction | undefined> {
        return this.askWebview<JobDetailAction>({
            taskType: 'job-detail',
            data,
        });
    }

    // ================================================================
    // HTML generation
    // ================================================================

    /**
     * Generate the webview HTML content.
     * Loads the external JS and CSS files from the webview directory.
     */
    private getHtmlContent(): string {
        const webview = this.panel.webview;

        // Get URIs for webview resources
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'wizard.css')
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'wizard.js')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; media-src ${webview.cspSource};">
    <link href="${cssUri}" rel="stylesheet">
    <title>New GPU Job</title>
</head>
<body>
    <div id="wizard-root"></div>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
}

/**
 * Generate a random nonce for Content Security Policy
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
