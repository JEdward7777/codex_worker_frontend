import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Manifest, Job, JobWithState, JobState, WorkerResponse, CheckpointInfo } from '../types/manifest';

/**
 * Service for managing the GPU jobs manifest file
 */
export class ManifestService {
    private static readonly MANIFEST_DIR = 'gpu_jobs';
    private static readonly MANIFEST_FILE = 'manifest.yaml';
    private static readonly MANIFEST_VERSION = 1;

    /**
     * Get the full path to the manifest file
     */
    private getManifestPath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        return path.join(workspaceRoot, ManifestService.MANIFEST_DIR, ManifestService.MANIFEST_FILE);
    }

    /**
     * Get the directory path for job folders
     */
    private getJobsDirectory(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        return path.join(workspaceRoot, ManifestService.MANIFEST_DIR);
    }

    /**
     * Generate a unique job ID
     */
    generateJobId(): string {
        // Generate a random unique ID using timestamp + random string
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `${timestamp}_${randomStr}`;
    }

    /**
     * Read the manifest file
     * Returns null if file doesn't exist
     */
    async readManifest(): Promise<Manifest | null> {
        const manifestPath = this.getManifestPath();
        if (!manifestPath) {
            throw new Error('No workspace folder open');
        }

        if (!fs.existsSync(manifestPath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(manifestPath, 'utf8');
            const manifest = yaml.load(content) as Manifest;

            // Validate manifest structure
            this.validateManifest(manifest);

            return manifest;
        } catch (error) {
            throw new Error(`Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Write the manifest file
     */
    async writeManifest(manifest: Manifest): Promise<void> {
        const manifestPath = this.getManifestPath();
        if (!manifestPath) {
            throw new Error('No workspace folder open');
        }

        // Validate before writing
        this.validateManifest(manifest);

        // Ensure directory exists
        const manifestDir = path.dirname(manifestPath);
        if (!fs.existsSync(manifestDir)) {
            fs.mkdirSync(manifestDir, { recursive: true });
        }

        try {
            const yamlContent = yaml.dump(manifest, {
                indent: 2,
                lineWidth: -1, // Don't wrap lines
                noRefs: true
            });
            fs.writeFileSync(manifestPath, yamlContent, 'utf8');
        } catch (error) {
            throw new Error(`Failed to write manifest: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create a new empty manifest
     */
    createEmptyManifest(): Manifest {
        return {
            version: ManifestService.MANIFEST_VERSION,
            jobs: []
        };
    }

    /**
     * Add a job to the manifest.
     * Automatically sets submitted_at to the current ISO 8601 timestamp
     * if it is not already provided.
     */
    async addJob(job: Job): Promise<void> {
        let manifest = await this.readManifest();

        if (!manifest) {
            manifest = this.createEmptyManifest();
        }

        // Check for duplicate job ID
        if (manifest.jobs.some(j => j.job_id === job.job_id)) {
            throw new Error(`Job with ID ${job.job_id} already exists`);
        }

        // Auto-populate submitted_at if not already set
        if (!job.submitted_at) {
            job.submitted_at = new Date().toISOString();
        }

        manifest.jobs.push(job);
        await this.writeManifest(manifest);
    }

    /**
     * Update an existing job in the manifest
     */
    async updateJob(jobId: string, updates: Partial<Job>): Promise<void> {
        const manifest = await this.readManifest();

        if (!manifest) {
            throw new Error('No manifest file exists');
        }

        const jobIndex = manifest.jobs.findIndex(j => j.job_id === jobId);
        if (jobIndex === -1) {
            throw new Error(`Job with ID ${jobId} not found`);
        }

        // Merge updates into existing job
        manifest.jobs[jobIndex] = {
            ...manifest.jobs[jobIndex],
            ...updates,
            job_id: jobId // Ensure job_id cannot be changed
        };

        await this.writeManifest(manifest);
    }

    /**
     * Cancel a job by setting the canceled flag
     */
    async cancelJob(jobId: string): Promise<void> {
        await this.updateJob(jobId, { canceled: true });
    }

    /**
     * Remove a job from the manifest
     */
    async removeJob(jobId: string): Promise<void> {
        const manifest = await this.readManifest();

        if (!manifest) {
            throw new Error('No manifest file exists');
        }

        const jobIndex = manifest.jobs.findIndex(j => j.job_id === jobId);
        if (jobIndex === -1) {
            throw new Error(`Job with ID ${jobId} not found`);
        }

        // Remove the job from the array
        manifest.jobs.splice(jobIndex, 1);

        await this.writeManifest(manifest);
    }

    /**
     * Delete the job folder from disk (gpu_jobs/job_<id>/).
     * This removes the response file, model checkpoint, logs, and all other artifacts.
     * Does nothing if the folder doesn't exist.
     */
    async deleteJobFolder(jobId: string): Promise<void> {
        const jobsDir = this.getJobsDirectory();
        if (!jobsDir) {
            return;
        }

        const jobFolder = path.join(jobsDir, `job_${jobId}`);
        if (!fs.existsSync(jobFolder)) {
            return;
        }

        // Recursively delete the job folder
        fs.rmSync(jobFolder, { recursive: true, force: true });
    }

    /**
     * Get all jobs with their current state from filesystem
     */
    async getJobsWithState(): Promise<JobWithState[]> {
        const manifest = await this.readManifest();

        if (!manifest) {
            return [];
        }

        const jobsDir = this.getJobsDirectory();
        if (!jobsDir) {
            throw new Error('No workspace folder open');
        }

        return manifest.jobs.map(job => {
            const state = this.determineJobState(job, jobsDir);
            return {
                ...job,
                ...state
            };
        });
    }

    /**
     * Determine job state from filesystem
     */
    private determineJobState(job: Job, jobsDir: string): {
        state: JobState;
        worker_id?: string;
        epochs_completed?: number;
        error_message?: string;
        status_message?: string;
        response_timestamp?: string;
    } {
        const jobFolder = path.join(jobsDir, `job_${job.job_id}`);
        const responsePath = path.join(jobFolder, 'response.yaml');

        // Check if job folder exists
        if (!fs.existsSync(jobFolder)) {
            return { state: 'pending' };
        }

        // Check if response file exists
        if (!fs.existsSync(responsePath)) {
            // Job folder exists but no response yet - assume running
            return { state: 'running' };
        }

        // Read response file
        try {
            const responseContent = fs.readFileSync(responsePath, 'utf8');
            const response = yaml.load(responseContent) as WorkerResponse;

            // Use response timestamp if available, otherwise fall back to file mtime
            let responseTimestamp = response.timestamp;
            if (!responseTimestamp) {
                try {
                    const stat = fs.statSync(responsePath);
                    responseTimestamp = stat.mtime.toISOString();
                } catch {
                    // Ignore stat errors
                }
            }

            return {
                state: response.state,
                worker_id: response.worker_id,
                epochs_completed: response.epochs_completed,
                error_message: response.error_message,
                status_message: response.status_message,
                response_timestamp: responseTimestamp
            };
        } catch (error) {
            // If we can't read the response, assume running
            return { state: 'running' };
        }
    }

    /**
     * Validate manifest structure
     */
    private validateManifest(manifest: any): void {
        if (!manifest || typeof manifest !== 'object') {
            throw new Error('Invalid manifest: must be an object');
        }

        if (typeof manifest.version !== 'number') {
            throw new Error('Invalid manifest: version must be a number');
        }

        if (manifest.version !== ManifestService.MANIFEST_VERSION) {
            throw new Error(`Unsupported manifest version: ${manifest.version} (expected ${ManifestService.MANIFEST_VERSION})`);
        }

        if (!Array.isArray(manifest.jobs)) {
            throw new Error('Invalid manifest: jobs must be an array');
        }

        // Validate each job
        manifest.jobs.forEach((job: any, index: number) => {
            this.validateJob(job, index);
        });
    }

    /**
     * Validate individual job structure
     */
    private validateJob(job: any, index: number): void {
        const prefix = `Invalid job at index ${index}`;

        if (!job || typeof job !== 'object') {
            throw new Error(`${prefix}: must be an object`);
        }

        if (typeof job.job_id !== 'string' || !job.job_id) {
            throw new Error(`${prefix}: job_id must be a non-empty string`);
        }

        const validJobTypes = ['tts', 'asr'];
        if (!validJobTypes.includes(job.job_type)) {
            throw new Error(`${prefix}: job_type must be one of ${validJobTypes.join(', ')}`);
        }

        const validModes = ['training', 'inference', 'training_and_inference'];
        if (!validModes.includes(job.mode)) {
            throw new Error(`${prefix}: mode must be one of ${validModes.join(', ')}`);
        }

        if (!job.model || typeof job.model !== 'object') {
            throw new Error(`${prefix}: model must be an object`);
        }

        if (typeof job.model.type !== 'string' || !job.model.type) {
            throw new Error(`${prefix}: model.type must be a non-empty string`);
        }

        // Optional field validations
        if (job.epochs !== undefined && (typeof job.epochs !== 'number' || job.epochs <= 0)) {
            throw new Error(`${prefix}: epochs must be a positive number`);
        }

        if (job.canceled !== undefined && typeof job.canceled !== 'boolean') {
            throw new Error(`${prefix}: canceled must be a boolean`);
        }
    }

    /**
     * Check if manifest file exists
     */
    async manifestExists(): Promise<boolean> {
        const manifestPath = this.getManifestPath();
        if (!manifestPath) {
            return false;
        }
        return fs.existsSync(manifestPath);
    }

    /**
     * Get a specific job by ID
     */
    async getJob(jobId: string): Promise<Job | null> {
        const manifest = await this.readManifest();
        if (!manifest) {
            return null;
        }

        return manifest.jobs.find(j => j.job_id === jobId) || null;
    }

    /**
     * Discover available checkpoints from completed jobs that match a given model type.
     * Reads result.checkpoint_path from each job's response.yaml.
     */
    async getAvailableCheckpoints(modelType: string): Promise<CheckpointInfo[]> {
        const manifest = await this.readManifest();
        if (!manifest) {
            return [];
        }

        const jobsDir = this.getJobsDirectory();
        if (!jobsDir) {
            return [];
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return [];
        }

        const checkpoints: CheckpointInfo[] = [];

        for (const job of manifest.jobs) {
            // Filter by model type
            if (job.model.type !== modelType) {
                continue;
            }

            const jobFolder = path.join(jobsDir, `job_${job.job_id}`);
            const responsePath = path.join(jobFolder, 'response.yaml');

            // Check if response file exists
            if (!fs.existsSync(responsePath)) {
                continue;
            }

            try {
                const responseContent = fs.readFileSync(responsePath, 'utf8');
                const response = yaml.load(responseContent) as WorkerResponse;

                // Only include completed jobs
                if (response.state !== 'completed') {
                    continue;
                }

                // Check for checkpoint path in result
                const checkpointPath = response.result?.checkpoint_path;
                if (!checkpointPath) {
                    continue;
                }

                // Verify the checkpoint file actually exists
                const absoluteCheckpointPath = path.resolve(workspaceRoot, checkpointPath);
                if (!fs.existsSync(absoluteCheckpointPath)) {
                    continue;
                }

                // Determine timestamp: prefer response.yaml timestamp, fall back to file mtime
                let timestamp: string | undefined;
                let fileTimestamp: Date | undefined;

                if (response.timestamp) {
                    // Validate the timestamp is parseable
                    const parsed = new Date(response.timestamp);
                    if (!isNaN(parsed.getTime())) {
                        timestamp = response.timestamp;
                    }
                }

                // Always get file timestamp as fallback
                try {
                    const stat = fs.statSync(responsePath);
                    fileTimestamp = stat.mtime;
                } catch {
                    // Ignore stat errors
                }

                // If no valid timestamp from response, use file timestamp
                if (!timestamp && fileTimestamp) {
                    timestamp = fileTimestamp.toISOString();
                }

                // Determine if the job had verse filtering (training or inference)
                const filtered = !!(
                    job.training?.include_verses?.length ||
                    job.training?.exclude_verses?.length ||
                    job.inference?.include_verses?.length ||
                    job.inference?.exclude_verses?.length
                );

                checkpoints.push({
                    jobId: job.job_id,
                    jobName: job.name,
                    checkpointPath,
                    modelType: job.model.type,
                    epochs: job.epochs,
                    timestamp,
                    fileTimestamp,
                    filtered
                });
            } catch {
                // Skip jobs with unreadable response files
                continue;
            }
        }

        // Sort by timestamp descending (newest first)
        checkpoints.sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dateB - dateA;
        });

        return checkpoints;
    }
}