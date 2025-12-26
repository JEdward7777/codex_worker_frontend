/**
 * Service for performing preflight checks before job submission
 */

import * as vscode from 'vscode';
import { PreflightCheckResult, JobCreationParams } from '../types/ui';
import { AudioDiscoveryService } from './AudioDiscoveryService';
import { ManifestService } from './ManifestService';
import { GitLabService } from './GitLabService';

/**
 * Minimum recommended audio pairs for training
 */
const MIN_RECOMMENDED_AUDIO_PAIRS = 50;

/**
 * Service for validating job parameters before submission
 */
export class PreflightService {
    constructor(
        private audioDiscoveryService: AudioDiscoveryService,
        private manifestService: ManifestService,
        private gitlabService: GitLabService
    ) {}

    /**
     * Perform all preflight checks for a job
     */
    async performChecks(params: JobCreationParams): Promise<PreflightCheckResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Get audio statistics
        const audioStats = await this.checkAudioData(params, errors, warnings);

        // Check for running jobs
        await this.checkRunningJobs(warnings);

        // Check base model if specified
        if (params.baseCheckpoint) {
            await this.checkBaseModel(params.baseCheckpoint, errors);
        }

        // Check GitLab connectivity
        await this.checkGitLabConnectivity(errors);

        // Validate verse selection
        if (params.includeVerses || params.excludeVerses) {
            this.validateVerseSelection(params, warnings);
        }

        // Check if mode requires certain parameters
        this.validateModeRequirements(params, errors);

        return {
            passed: errors.length === 0,
            errors,
            warnings,
            audioStats
        };
    }

    /**
     * Check audio data availability and quality
     */
    private async checkAudioData(
        params: JobCreationParams,
        errors: string[],
        warnings: string[]
    ): Promise<{ totalPairs: number; missingRecordings: number; coveragePercentage: number }> {
        try {
            const summary = await this.audioDiscoveryService.discoverAudio({ validateFiles: true });

            const totalPairs = summary.totalVerses;
            const missingRecordings = summary.versesWithoutAudio;
            const coveragePercentage = (summary.versesWithAudio / summary.totalVerses) * 100;

            // For training modes, check if we have sufficient audio
            if (params.mode === 'training' || params.mode === 'training_and_inference') {
                if (summary.versesWithAudio === 0) {
                    errors.push('No audio recordings found. Training requires audio data.');
                } else if (summary.versesWithAudio < MIN_RECOMMENDED_AUDIO_PAIRS) {
                    warnings.push(
                        `Only ${summary.versesWithAudio} audio recordings found. ` +
                        `Recommended minimum: ${MIN_RECOMMENDED_AUDIO_PAIRS} for quality training.`
                    );
                }
            }

            // For inference mode, check if base model is specified
            if (params.mode === 'inference' && !params.baseCheckpoint) {
                errors.push('Inference mode requires a base checkpoint to be specified.');
            }

            return {
                totalPairs,
                missingRecordings,
                coveragePercentage
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to analyze audio data: ${errorMessage}`);
            return {
                totalPairs: 0,
                missingRecordings: 0,
                coveragePercentage: 0
            };
        }
    }

    /**
     * Check if there are already running jobs
     */
    private async checkRunningJobs(warnings: string[]): Promise<void> {
        try {
            const jobs = await this.manifestService.getJobsWithState();
            const runningJobs = jobs.filter(job => job.state === 'running');

            if (runningJobs.length > 0) {
                warnings.push(
                    `${runningJobs.length} job(s) already running. ` +
                    `Submitting another job may compete for GPU resources.`
                );
            }

            const pendingJobs = jobs.filter(job => job.state === 'pending');
            if (pendingJobs.length > 0) {
                warnings.push(
                    `${pendingJobs.length} job(s) pending. ` +
                    `New job will be queued after existing jobs.`
                );
            }
        } catch (error) {
            // Non-critical - just skip this check
            console.warn('Failed to check running jobs:', error);
        }
    }

    /**
     * Check if base model exists (basic validation)
     */
    private async checkBaseModel(checkpoint: string, errors: string[]): Promise<void> {
        // For now, just do basic validation
        // In the future, could check if the checkpoint file/job actually exists
        
        if (!checkpoint || checkpoint.trim().length === 0) {
            errors.push('Base checkpoint path cannot be empty.');
            return;
        }

        // Check if it looks like a valid path or job ID
        const isJobId = checkpoint.startsWith('job_');
        const isPath = checkpoint.includes('/') || checkpoint.includes('\\') || checkpoint.endsWith('.pt');

        if (!isJobId && !isPath) {
            errors.push(
                `Base checkpoint "${checkpoint}" doesn't look like a valid path or job ID. ` +
                `Expected format: "job_xxx" or "path/to/model.pt"`
            );
        }
    }

    /**
     * Check GitLab connectivity and project sharing capability
     */
    private async checkGitLabConnectivity(errors: string[]): Promise<void> {
        try {
            // Check if we can get the project ID
            const projectId = await this.gitlabService.getProjectIdFromWorkspace();
            if (!projectId) {
                errors.push(
                    'Cannot detect GitLab project. ' +
                    'Make sure this is a Git repository with a GitLab remote.'
                );
                return;
            }

            // Check if worker is already a member (non-blocking)
            const isMember = await this.gitlabService.isWorkerMember();
            if (!isMember) {
                // This is fine - we'll add them when submitting the job
                console.log('Worker is not yet a project member (will be added on job submission)');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`GitLab connectivity check failed: ${errorMessage}`);
        }
    }

    /**
     * Validate verse selection parameters
     */
    private validateVerseSelection(params: JobCreationParams, warnings: string[]): void {
        if (params.includeVerses && params.excludeVerses) {
            warnings.push(
                'Both include and exclude verse lists specified. ' +
                'Include list will take precedence.'
            );
        }

        if (params.includeVerses && params.includeVerses.length === 0) {
            warnings.push('Include verse list is empty - no verses will be processed.');
        }

        // Basic format validation for verse references
        const allVerses = [...(params.includeVerses || []), ...(params.excludeVerses || [])];
        for (const verse of allVerses) {
            if (!this.isValidVerseReference(verse)) {
                warnings.push(`Verse reference "${verse}" may not be in the correct format (expected: BOOK CHAPTER:VERSE)`);
            }
        }
    }

    /**
     * Validate that mode has required parameters
     */
    private validateModeRequirements(params: JobCreationParams, errors: string[]): void {
        // Training modes require epochs
        if ((params.mode === 'training' || params.mode === 'training_and_inference') && !params.epochs) {
            errors.push('Training mode requires epoch count to be specified.');
        }

        // Inference mode requires base checkpoint
        if (params.mode === 'inference' && !params.baseCheckpoint) {
            errors.push('Inference mode requires a base checkpoint to be specified.');
        }

        // Validate epochs range
        if (params.epochs !== undefined) {
            if (params.epochs <= 0) {
                errors.push('Epoch count must be greater than 0.');
            }
            if (params.epochs > 10000) {
                errors.push('Epoch count seems unreasonably high (max: 10000).');
            }
        }
    }

    /**
     * Basic validation for verse reference format
     */
    private isValidVerseReference(verse: string): boolean {
        // Expected format: "BOOK CHAPTER:VERSE" or "BOOK CHAPTER:VERSE-VERSE"
        // Examples: "JHN 1:1", "MAT 5:1-10", "1CH 2:3"
        const pattern = /^[A-Z0-9]{3}\s+\d+:\d+(-\d+)?$/;
        return pattern.test(verse.trim());
    }

    /**
     * Get a summary of audio coverage by book
     */
    async getAudioCoverageSummary(): Promise<string> {
        try {
            const summary = await this.audioDiscoveryService.discoverAudio({ validateFiles: true });
            const lines: string[] = [];

            lines.push(`Total Coverage: ${summary.versesWithAudio}/${summary.totalVerses} verses (${((summary.versesWithAudio / summary.totalVerses) * 100).toFixed(1)}%)`);
            lines.push('');
            lines.push('By Book:');

            for (const book of summary.books) {
                const totalInBook = summary.versesByBook.get(book) || 0;
                const audioInBook = summary.audioByBook.get(book) || 0;
                const coverage = totalInBook > 0 ? (audioInBook / totalInBook) * 100 : 0;
                lines.push(`  ${book}: ${audioInBook}/${totalInBook} (${coverage.toFixed(1)}%)`);
            }

            return lines.join('\n');
        } catch (error) {
            return 'Failed to get audio coverage summary';
        }
    }
}