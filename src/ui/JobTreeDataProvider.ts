/**
 * Tree data provider for the GPU Jobs sidebar
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { JobWithState, JobState } from '../types/manifest';
import { ManifestService } from '../services/ManifestService';

/**
 * Tree item representing a single job in the sidebar
 */
export class JobTreeItem extends vscode.TreeItem {
    constructor(
        public readonly job: JobWithState,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(job.job_id, collapsibleState);
        
        this.tooltip = this.buildTooltip();
        this.description = this.buildDescription();
        this.iconPath = this.getIconForState(job.state);
        this.contextValue = this.getContextValue();
    }

    private buildTooltip(): string {
        const lines: string[] = [
            `Job ID: ${this.job.job_id}`,
            `Type: ${this.job.job_type}`,
            `Mode: ${this.job.mode}`,
            `State: ${this.job.state}`,
            `Model: ${this.job.model.type}`
        ];

        if (this.job.model.base_checkpoint) {
            lines.push(`Base: ${this.job.model.base_checkpoint}`);
        }

        if (this.job.epochs) {
            const progress = this.job.epochs_completed 
                ? `${this.job.epochs_completed}/${this.job.epochs}`
                : `0/${this.job.epochs}`;
            lines.push(`Epochs: ${progress}`);
        }

        if (this.job.worker_id) {
            lines.push(`Worker: ${this.job.worker_id}`);
        }

        if (this.job.inference) {
            if (this.job.inference.include_verses) {
                lines.push(`Include: ${this.job.inference.include_verses.length} verses`);
            }
            if (this.job.inference.exclude_verses) {
                lines.push(`Exclude: ${this.job.inference.exclude_verses.length} verses`);
            }
        }

        if (this.job.error_message) {
            lines.push(`Error: ${this.job.error_message}`);
        }

        if (this.job.canceled) {
            lines.push('⚠️ Canceled by user');
        }

        return lines.join('\n');
    }

    private buildDescription(): string {
        const parts: string[] = [];

        // State indicator
        parts.push(this.getStateEmoji(this.job.state));

        // Worker name if claimed
        if (this.job.worker_id) {
            parts.push(`Worker: ${this.job.worker_id}`);
        }

        // Epoch progress if available
        if (this.job.epochs && this.job.state === 'running') {
            const progress = this.job.epochs_completed || 0;
            parts.push(`${progress}/${this.job.epochs} epochs`);
        }

        // Mode
        parts.push(this.job.mode);

        return parts.join(' • ');
    }

    private getStateEmoji(state: string): string {
        switch (state) {
            case 'pending': return '⏳';
            case 'running': return '▶️';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'canceled': return '🚫';
            default: return '❓';
        }
    }

    private getIconForState(state: string): vscode.ThemeIcon {
        switch (state) {
            case 'pending':
                return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
            case 'running':
                return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
            case 'completed':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case 'canceled':
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    private getContextValue(): string {
        // Context value determines which commands are available in the context menu
        const values: string[] = ['gpuJob'];
        
        if (this.job.state === 'pending' || this.job.state === 'running') {
            values.push('cancelable');
        }
        
        if (this.job.state === 'completed') {
            values.push('completed');
        }

        return values.join(',');
    }
}

/**
 * Tree data provider for GPU jobs
 */
export class JobTreeDataProvider implements vscode.TreeDataProvider<JobTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JobTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<JobTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<JobTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(
        private workspaceRoot: string,
        private manifestService: ManifestService
    ) {}

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item for display
     */
    getTreeItem(element: JobTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children (jobs) for the tree
     */
    async getChildren(element?: JobTreeItem): Promise<JobTreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder open');
            return [];
        }

        if (element) {
            // No children for individual jobs (flat list)
            return [];
        }

        try {
            // Get all jobs with their states
            const jobs = await this.manifestService.getJobsWithState();
            
            if (jobs.length === 0) {
                return [];
            }

            // Sort jobs: running first, then pending, then completed/failed/canceled
            const sortedJobs = jobs.sort((a: JobWithState, b: JobWithState) => {
                const stateOrder: Record<JobState, number> = {
                    'running': 0,
                    'pending': 1,
                    'completed': 2,
                    'failed': 3,
                    'canceled': 4
                };
                
                const orderA = stateOrder[a.state] ?? 5;
                const orderB = stateOrder[b.state] ?? 5;
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                // Within same state, sort by job_id (newest first)
                return b.job_id.localeCompare(a.job_id);
            });

            return sortedJobs.map((job: JobWithState) =>
                new JobTreeItem(job, vscode.TreeItemCollapsibleState.None)
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to load jobs: ${errorMessage}`);
            return [];
        }
    }

    /**
     * Get the number of active jobs (pending or running)
     */
    async getActiveJobCount(): Promise<number> {
        try {
            const jobs = await this.manifestService.getJobsWithState();
            return jobs.filter((job: JobWithState) =>
                job.state === 'pending' || job.state === 'running'
            ).length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check if there are any running jobs
     */
    async hasRunningJobs(): Promise<boolean> {
        try {
            const jobs = await this.manifestService.getJobsWithState();
            return jobs.some((job: JobWithState) => job.state === 'running');
        } catch (error) {
            return false;
        }
    }
}