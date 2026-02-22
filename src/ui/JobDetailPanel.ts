/**
 * Job Detail Panel — shows detailed information about a job with action buttons.
 *
 * Follows the same extension-driven, webview-passive pattern as NewJobWizard:
 * the extension sends a single 'job-detail' task to the webview, awaits the
 * user's action choice, handles it, and closes the panel.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { JobWithState, WorkerResponse, JobState } from '../types/manifest';
import { JobDetailData, JobDetailAction } from '../types/ui';
import { ManifestService } from '../services/ManifestService';
import { WebviewUI } from './WebviewUI';

/**
 * Result returned from the job detail panel to the caller (extension.ts).
 * Contains the action taken and any context needed for follow-up operations.
 */
export interface JobDetailResult {
    /** The action the user selected */
    action: JobDetailAction;
    /** The job that was being viewed (state at time of action) */
    job: JobWithState;
    /** Resolved checkpoint path for further-train / run-inference actions */
    checkpointPath?: string;
}

/**
 * Orchestrator for the job detail panel.
 * Opens a webview showing job details and action buttons, handles the selected action.
 */
export class JobDetailPanel {
    private workspaceRoot: string;
    /** The active WebviewUI instance, tracked so it can be disposed externally */
    private ui: WebviewUI | null = null;

    constructor(
        private manifestService: ManifestService,
        private extensionUri: vscode.Uri,
    ) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    /**
     * Dispose the panel externally. This causes the pending showJobDetail()
     * promise to resolve to undefined, allowing the run() method to exit cleanly.
     */
    dispose(): void {
        if (this.ui) {
            this.ui.dispose();
            this.ui = null;
        }
    }

    /**
     * Show the job detail panel and handle the user's action.
     * Returns a JobDetailResult if an action was taken that the caller needs
     * to follow up on (further-train, run-inference), or null if the panel
     * was closed without a follow-up action.
     */
    async run(job: JobWithState): Promise<JobDetailResult | null> {
        const panelLabel = job.name || job.job_id;
        this.ui = new WebviewUI(
            this.extensionUri,
            this.workspaceRoot,
            `Job: ${panelLabel}`
        );

        try {
            const actions = this.computeAvailableActions(job);
            const detailData = this.buildDetailData(job, actions);
            const action = await this.ui.showJobDetail(detailData);

            if (!action) {
                // Panel was closed without selecting an action
                return null;
            }

            // Handle the action
            return await this.handleAction(action, job);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Job detail error: ${errorMessage}`);
            return null;
        } finally {
            if (this.ui) {
                this.ui.dispose();
                this.ui = null;
            }
        }
    }

    /**
     * Determine which actions are available based on the job's current state and mode.
     */
    private computeAvailableActions(job: JobWithState): JobDetailAction[] {
        const actions: JobDetailAction[] = [];

        // Cancel: only for pending or running jobs
        if (job.state === 'pending' || job.state === 'running') {
            actions.push('cancel-job');
        }

        // Delete: always available
        actions.push('delete-job');

        // Further Train: available on completed jobs (uses produced checkpoint)
        // or inference jobs (uses the base_checkpoint they referenced)
        if (job.state === 'completed') {
            const checkpoint = this.resolveCheckpointForTraining(job);
            if (checkpoint) {
                actions.push('further-train');
            }
        }

        // Run Inference: available on completed training jobs that produced a checkpoint
        if (job.state === 'completed' &&
            (job.mode === 'training' || job.mode === 'training_and_inference')) {
            const checkpoint = this.getProducedCheckpoint(job.job_id);
            if (checkpoint) {
                actions.push('run-inference');
            }
        }

        // Clone Job: available on completed or failed jobs (re-submit with same params)
        if (job.state === 'completed' || job.state === 'failed' || job.state === 'canceled') {
            actions.push('clone-job');
        }

        // Open Job Folder: available when the job folder exists on disk
        const jobFolderPath = this.getJobFolderPath(job.job_id);
        if (jobFolderPath && fs.existsSync(jobFolderPath)) {
            // View Logs: only if logs.txt exists in the job folder
            const logsPath = path.join(jobFolderPath, 'logs.txt');
            if (fs.existsSync(logsPath)) {
                actions.push('view-logs');
            }
            actions.push('open-job-folder');
        }

        return actions;
    }

    /**
     * Build the detail data payload to send to the webview.
     */
    private buildDetailData(job: JobWithState, availableActions: JobDetailAction[]): JobDetailData {
        const jobFolderPath = this.getJobFolderPath(job.job_id);
        return {
            jobId: job.job_id,
            name: job.name,
            description: job.description,
            jobType: job.job_type,
            mode: job.mode,
            state: job.state,
            modelType: job.model.type,
            baseCheckpoint: job.model.base_checkpoint,
            epochs: job.epochs,
            epochsCompleted: job.epochs_completed,
            workerId: job.worker_id,
            submittedAt: job.submitted_at,
            responseTimestamp: job.response_timestamp,
            errorMessage: job.error_message,
            canceled: job.canceled ?? false,
            trainingVerseCount: this.countVerses(job.training?.include_verses, job.training?.exclude_verses),
            inferenceVerseCount: this.countVerses(job.inference?.include_verses, job.inference?.exclude_verses),
            voiceReference: job.voice_reference,
            hasJobFolder: !!(jobFolderPath && fs.existsSync(jobFolderPath)),
            availableActions,
        };
    }

    /**
     * Count verses for display (returns the include count, exclude count, or undefined for "all").
     */
    private countVerses(include?: string[], exclude?: string[]): number | undefined {
        if (include && include.length > 0) {
            return include.length;
        }
        if (exclude && exclude.length > 0) {
            return exclude.length;
        }
        return undefined;
    }

    /**
     * Handle the user's selected action.
     * Returns a JobDetailResult for actions that need follow-up, or null for terminal actions.
     */
    private async handleAction(
        action: JobDetailAction,
        job: JobWithState
    ): Promise<JobDetailResult | null> {
        switch (action) {
            case 'cancel-job': {
                await this.manifestService.cancelJob(job.job_id);
                vscode.window.showInformationMessage(`Job ${job.job_id} has been canceled.`);
                return null; // Close panel, no follow-up needed
            }

            case 'delete-job': {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete job ${job.job_id}?\n\n` +
                    'This will permanently delete:\n' +
                    '• The trained model checkpoint\n' +
                    '• All job output files and logs\n' +
                    '• The job entry from the manifest\n\n' +
                    'You will not be able to generate audio from this model ' +
                    'without recovering it from version control.',
                    { modal: true },
                    'Delete',
                    'Cancel'
                );

                if (confirm === 'Delete') {
                    // Delete the job folder first (model files, logs, etc.)
                    await this.manifestService.deleteJobFolder(job.job_id);
                    // Then remove from manifest
                    await this.manifestService.removeJob(job.job_id);
                    vscode.window.showInformationMessage(`Job ${job.job_id} has been deleted.`);
                }
                return null; // Close panel, no follow-up needed
            }

            case 'further-train': {
                const checkpointPath = this.resolveCheckpointForTraining(job);
                return {
                    action: 'further-train',
                    job,
                    checkpointPath: checkpointPath || undefined,
                };
            }

            case 'run-inference': {
                const checkpointPath = this.getProducedCheckpoint(job.job_id);
                return {
                    action: 'run-inference',
                    job,
                    checkpointPath: checkpointPath || undefined,
                };
            }

            case 'clone-job': {
                // Return the action so extension.ts can launch the wizard pre-filled
                // with the same parameters as this job
                return {
                    action: 'clone-job',
                    job,
                };
            }

            case 'view-logs': {
                // Open the logs.txt file in the editor
                const jobFolderPath = this.getJobFolderPath(job.job_id);
                if (jobFolderPath) {
                    const logsPath = path.join(jobFolderPath, 'logs.txt');
                    if (fs.existsSync(logsPath)) {
                        const doc = await vscode.workspace.openTextDocument(logsPath);
                        await vscode.window.showTextDocument(doc, { preview: true });
                    } else {
                        vscode.window.showWarningMessage('No logs file found for this job.');
                    }
                }
                return null;
            }

            case 'open-job-folder': {
                // Reveal the job folder in the file explorer
                const jobFolderPath = this.getJobFolderPath(job.job_id);
                if (jobFolderPath && fs.existsSync(jobFolderPath)) {
                    const folderUri = vscode.Uri.file(jobFolderPath);
                    await vscode.commands.executeCommand('revealInExplorer', folderUri);
                } else {
                    vscode.window.showWarningMessage('Job folder not found on disk.');
                }
                return null;
            }

            default:
                return null;
        }
    }

    /**
     * Resolve the checkpoint path to use for "Further Train" action.
     * - For training/training_and_inference jobs: uses the produced checkpoint
     * - For inference jobs: uses the base_checkpoint they were referencing
     */
    private resolveCheckpointForTraining(job: JobWithState): string | null {
        if (job.mode === 'training' || job.mode === 'training_and_inference') {
            return this.getProducedCheckpoint(job.job_id);
        }
        if (job.mode === 'inference') {
            return job.model.base_checkpoint ?? null;
        }
        return null;
    }

    /**
     * Get the absolute path to a job's folder on disk.
     * Returns null if no workspace root is available.
     */
    private getJobFolderPath(jobId: string): string | null {
        if (!this.workspaceRoot) {
            return null;
        }
        return path.join(this.workspaceRoot, 'gpu_jobs', `job_${jobId}`);
    }

    /**
     * Read the checkpoint path produced by a completed job from its response.yaml.
     * Returns null if the job hasn't produced a checkpoint or the file doesn't exist.
     */
    private getProducedCheckpoint(jobId: string): string | null {
        if (!this.workspaceRoot) {
            return null;
        }

        const responsePath = path.join(
            this.workspaceRoot, 'gpu_jobs', `job_${jobId}`, 'response.yaml'
        );

        if (!fs.existsSync(responsePath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(responsePath, 'utf8');
            const response = yaml.load(content) as WorkerResponse;

            if (response.state !== 'completed' || !response.result?.checkpoint_path) {
                return null;
            }

            // Verify the checkpoint file actually exists
            const absolutePath = path.resolve(this.workspaceRoot, response.result.checkpoint_path);
            if (!fs.existsSync(absolutePath)) {
                return null;
            }

            return response.result.checkpoint_path;
        } catch {
            return null;
        }
    }
}
