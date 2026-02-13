/**
 * Multi-step wizard for creating new GPU jobs.
 *
 * Uses WebviewUI for all user interaction. The extension drives the control
 * flow via sequential `await` calls; the webview is a stateless terminal.
 */

import * as vscode from 'vscode';
import {
    JobCreationParams,
    PreflightCheckResult,
    WebviewQuickPickItem,
    VerseSelectorItem,
    ConfirmationPageData,
} from '../types/ui';
import { JobMode, TTSModelType } from '../types/manifest';
import { AudioDiscoveryService } from '../services/AudioDiscoveryService';
import { ManifestService } from '../services/ManifestService';
import { WebviewUI } from './WebviewUI';

/**
 * Wizard for creating new jobs via a webview panel.
 */
export class NewJobWizard {
    constructor(
        private audioDiscoveryService: AudioDiscoveryService,
        private manifestService: ManifestService,
        private extensionUri: vscode.Uri,
    ) {}

    /**
     * Run the job creation wizard.
     * Opens an ephemeral webview panel, walks the user through all steps,
     * and returns the created job parameters or null if canceled.
     */
    async run(): Promise<JobCreationParams | null> {
        const ui = new WebviewUI(this.extensionUri);

        try {
            let result: JobCreationParams | null = null;
            let done = false;

            while (!done) {
                result = await this.runWizardSteps(ui);
                if (!result) {
                    // User canceled at some step
                    break;
                }

                // Run preflight checks
                const preflightResult = await this.runPreflightChecks(result);

                // Build confirmation data
                const totalVerses = await this.getTotalVerseCount();
                const confirmData = this.buildConfirmationData(result, preflightResult, totalVerses);

                // Show confirmation
                const confirmAction = await ui.showConfirmation(confirmData);

                if (confirmAction === 'submit') {
                    done = true;
                } else if (confirmAction === 'start-over') {
                    // Loop continues — restart wizard
                    result = null;
                } else {
                    // undefined = panel closed / canceled
                    result = null;
                    break;
                }
            }

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create job: ${errorMessage}`);
            return null;
        } finally {
            ui.dispose();
        }
    }

    /**
     * Run through all wizard steps sequentially.
     * Returns JobCreationParams if all steps completed, or null if canceled.
     */
    private async runWizardSteps(ui: WebviewUI): Promise<JobCreationParams | null> {
        // Step 1: Select job mode
        const mode = await this.selectMode(ui);
        if (!mode) { return null; }

        // Step 2: Select model type
        const modelType = await this.selectModelType(ui);
        if (!modelType) { return null; }

        // Step 3: Select base checkpoint
        let currentMode = mode;
        const baseCheckpoint = await this.selectBaseCheckpoint(ui, currentMode, modelType);
        if (baseCheckpoint === undefined) {
            // For inference-only with no checkpoints, offer to switch
            if (currentMode === 'inference') {
                const switchItem = await ui.showQuickPick(
                    [
                        { label: 'Train & Infer', description: 'Train a new model first, then run inference' },
                        { label: 'Cancel', description: 'Go back' },
                    ],
                    {
                        title: 'No Checkpoints Available',
                        placeHolder: 'No trained model checkpoints found. Would you like to train first?',
                    }
                );
                if (switchItem?.label === 'Train & Infer') {
                    currentMode = 'training_and_inference';
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }

        // Step 4: Select epochs (if training)
        let epochs: number | undefined;
        if (currentMode === 'training' || currentMode === 'training_and_inference') {
            epochs = await this.selectEpochs(ui);
            if (epochs === undefined) { return null; }
        }

        // Step 5: Select verse filters
        let inferenceIncludeVerses: string[] | undefined;
        let inferenceExcludeVerses: string[] | undefined;
        let trainingIncludeVerses: string[] | undefined;
        let trainingExcludeVerses: string[] | undefined;

        if (currentMode === 'training_and_inference') {
            const trainingSelection = await this.selectVerses(ui, 'Training');
            if (!trainingSelection) { return null; }
            trainingIncludeVerses = trainingSelection.include;
            trainingExcludeVerses = trainingSelection.exclude;

            const inferenceSelection = await this.selectVerses(ui, 'Inference');
            if (!inferenceSelection) { return null; }
            inferenceIncludeVerses = inferenceSelection.include;
            inferenceExcludeVerses = inferenceSelection.exclude;
        } else if (currentMode === 'training') {
            const selection = await this.selectVerses(ui, 'Training');
            if (!selection) { return null; }
            trainingIncludeVerses = selection.include;
            trainingExcludeVerses = selection.exclude;
        } else if (currentMode === 'inference') {
            const selection = await this.selectVerses(ui, 'Inference');
            if (!selection) { return null; }
            inferenceIncludeVerses = selection.include;
            inferenceExcludeVerses = selection.exclude;
        }

        // Step 6: Select voice reference
        const voiceReference = await this.selectVoiceReference(ui);
        if (voiceReference === undefined) { return null; }

        return {
            mode: currentMode,
            modelType,
            baseCheckpoint: baseCheckpoint || undefined,
            epochs,
            inferenceIncludeVerses,
            inferenceExcludeVerses,
            trainingIncludeVerses,
            trainingExcludeVerses,
            voiceReference: voiceReference || undefined,
        };
    }

    // ================================================================
    // Individual wizard steps
    // ================================================================

    /**
     * Step 1: Select job mode
     */
    private async selectMode(ui: WebviewUI): Promise<JobMode | null> {
        const items: WebviewQuickPickItem[] = [
            {
                label: 'Training',
                description: 'Train a new TTS model',
                detail: 'Creates a new model or fine-tunes an existing one',
            },
            {
                label: 'Inference',
                description: 'Generate audio from text',
                detail: 'Uses an existing model to synthesize speech',
            },
            {
                label: 'Training and Inference',
                description: 'Train then generate audio',
                detail: 'Trains a model and then runs inference on selected verses',
            },
        ];

        const selected = await ui.showQuickPick(items, {
            title: 'Select Job Mode',
            placeHolder: 'What would you like to do?',
        });

        if (!selected) { return null; }

        const modeMap: Record<string, JobMode> = {
            'Training': 'training',
            'Inference': 'inference',
            'Training and Inference': 'training_and_inference',
        };

        return modeMap[selected.label] || null;
    }

    /**
     * Step 2: Select model type
     */
    private async selectModelType(ui: WebviewUI): Promise<TTSModelType | null> {
        const items: WebviewQuickPickItem[] = [
            {
                label: 'StableTTS',
                description: 'Stable Text-to-Speech model',
                detail: 'High-quality TTS with good stability',
            },
        ];

        const selected = await ui.showQuickPick(items, {
            title: 'Select Model Type',
            placeHolder: 'Which TTS model would you like to use?',
        });

        if (!selected) { return null; }
        return selected.label as TTSModelType;
    }

    /**
     * Step 3: Select base checkpoint
     * Returns: checkpoint path string, null (no checkpoint), or undefined (canceled)
     */
    private async selectBaseCheckpoint(
        ui: WebviewUI,
        mode: JobMode,
        modelType: string
    ): Promise<string | null | undefined> {
        const isRequired = mode === 'inference';

        if (!isRequired) {
            const items: WebviewQuickPickItem[] = [
                {
                    label: 'Train New Model',
                    description: 'Start from scratch',
                    detail: 'Create a brand new model without a base checkpoint',
                },
                {
                    label: 'Continue From Existing Model',
                    description: 'Fine-tune an existing model',
                    detail: 'Select a previously trained model as the base',
                },
            ];

            const selected = await ui.showQuickPick(items, {
                title: 'Base Model',
                placeHolder: 'Start from scratch or fine-tune an existing model?',
            });

            if (!selected) { return undefined; }

            if (selected.label === 'Train New Model') {
                return null; // No base checkpoint
            }
        }

        // Pick a checkpoint from completed jobs
        return this.pickCheckpoint(ui, modelType);
    }

    /**
     * Reusable checkpoint picker
     */
    private async pickCheckpoint(ui: WebviewUI, modelType: string): Promise<string | undefined> {
        const checkpoints = await this.manifestService.getAvailableCheckpoints(modelType);

        if (checkpoints.length === 0) {
            vscode.window.showWarningMessage(
                `No trained model checkpoints found for model type "${modelType}". Complete a training job first.`
            );
            return undefined;
        }

        const items: WebviewQuickPickItem[] = checkpoints.map(cp => {
            const parts: string[] = [];

            if (cp.epochs) {
                parts.push(`${cp.epochs} epochs`);
            }

            if (cp.timestamp) {
                try {
                    const date = new Date(cp.timestamp);
                    parts.push(date.toLocaleDateString());
                } catch {
                    // Skip
                }
            } else if (cp.fileTimestamp) {
                parts.push(cp.fileTimestamp.toLocaleDateString());
            }

            if (cp.filtered) {
                parts.push('filtered');
            }

            return {
                label: cp.jobId,
                description: parts.join(' • '),
                detail: cp.checkpointPath,
            };
        });

        const selected = await ui.showQuickPick(items, {
            title: 'Select Model Checkpoint',
            placeHolder: 'Choose a trained model checkpoint',
        });

        if (!selected) { return undefined; }
        return selected.detail;
    }

    /**
     * Step 4: Select number of epochs
     */
    private async selectEpochs(ui: WebviewUI): Promise<number | undefined> {
        const epochStr = await ui.showInputBox({
            title: 'Training Epochs',
            prompt: 'How many epochs should the model train for?',
            value: '100',
            validationRegex: '^[1-9]\\d{0,3}$',
            validationMessage: 'Please enter a positive number between 1 and 9999',
        });

        if (!epochStr) { return undefined; }
        return parseInt(epochStr, 10);
    }

    /**
     * Step 5: Select cells for a given phase (Training or Inference)
     */
    private async selectVerses(
        ui: WebviewUI,
        phase: string
    ): Promise<{ include?: string[]; exclude?: string[] } | null> {
        // First ask: all cells or specific?
        const scopeItems: WebviewQuickPickItem[] = [
            {
                label: 'All Cells',
                description: `Use all cells for ${phase.toLowerCase()}`,
                detail: `Process every cell in the project for ${phase.toLowerCase()}`,
            },
            {
                label: 'Specific Cells',
                description: 'Choose which cells to include/exclude',
                detail: `Manually specify cell references for ${phase.toLowerCase()}`,
            },
        ];

        const scopeSelected = await ui.showQuickPick(scopeItems, {
            title: `${phase} Cell Selection`,
            placeHolder: `Which cells should be used for ${phase.toLowerCase()}?`,
        });

        if (!scopeSelected) { return null; }

        if (scopeSelected.label === 'All Cells') {
            return {}; // No filters
        }

        // Ask include or exclude
        const filterTypeItems: WebviewQuickPickItem[] = [
            {
                label: 'Include Specific Cells',
                description: `Only use these cells for ${phase.toLowerCase()}`,
            },
            {
                label: 'Exclude Specific Cells',
                description: `Use all except these cells for ${phase.toLowerCase()}`,
            },
        ];

        const filterType = await ui.showQuickPick(filterTypeItems, {
            title: `${phase} Filter Type`,
            placeHolder: `Include or exclude cells for ${phase.toLowerCase()}?`,
        });

        if (!filterType) { return null; }

        const isInclude = filterType.label.includes('Include');
        const isInferenceInclude = phase === 'Inference' && isInclude;

        // Discover all verses for the selector
        const summary = await this.audioDiscoveryService.discoverAudio();
        const verseSelectorItems: VerseSelectorItem[] = summary.verses.map(v => ({
            cellId: v.cellId,
            displayRef: v.verseRef || v.cellId,
            hasAudio: v.hasAudio,
        }));

        // Show the interactive verse selector
        const result = await ui.showVerseSelector(verseSelectorItems, {
            phase,
            selectionMode: isInclude ? 'include' : 'exclude',
            showHideRecorded: isInferenceInclude,
        });

        if (!result) { return null; }

        if (result.selectedIds.length === 0) {
            // Nothing selected — treat as "all" (no filter)
            return {};
        }

        return isInclude
            ? { include: result.selectedIds }
            : { exclude: result.selectedIds };
    }

    /**
     * Step 6: Select voice reference (optional)
     */
    private async selectVoiceReference(ui: WebviewUI): Promise<string | null | undefined> {
        const items: WebviewQuickPickItem[] = [
            {
                label: 'Use Default Voice',
                description: 'No specific voice reference',
            },
            {
                label: 'Specify Voice Reference',
                description: 'Use a specific audio file as reference',
            },
        ];

        const selected = await ui.showQuickPick(items, {
            title: 'Voice Reference',
            placeHolder: 'Use a specific voice reference?',
        });

        if (!selected) { return undefined; }

        if (selected.label === 'Use Default Voice') {
            return null;
        }

        const reference = await ui.showInputBox({
            title: 'Voice Reference',
            prompt: 'Enter the path to the voice reference audio file',
            placeHolder: 'e.g., .project/attachments/files/JHN/audio-1.webm',
        });

        return reference || undefined;
    }

    // ================================================================
    // Preflight & confirmation helpers
    // ================================================================

    /**
     * Run preflight checks (delegates to PreflightService via extension.ts)
     * For now, we do a lightweight version here.
     */
    private async runPreflightChecks(params: JobCreationParams): Promise<PreflightCheckResult> {
        // We'll do a basic check here. The full preflight is done in extension.ts
        // before actual job submission.
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const summary = await this.audioDiscoveryService.discoverAudio({ validateFiles: true });
            const totalPairs = summary.totalVerses;
            const missingRecordings = summary.versesWithoutAudio;
            const coveragePercentage = totalPairs > 0
                ? (summary.versesWithAudio / totalPairs) * 100
                : 0;

            // Training checks
            if (params.mode === 'training' || params.mode === 'training_and_inference') {
                if (summary.versesWithAudio === 0) {
                    errors.push('No audio recordings found. Training requires audio data.');
                } else if (summary.versesWithAudio < 50) {
                    warnings.push(
                        `Only ${summary.versesWithAudio} audio recordings found. ` +
                        `Recommended minimum: 50 for quality training.`
                    );
                }
            }

            // Inference requires checkpoint
            if (params.mode === 'inference' && !params.baseCheckpoint) {
                errors.push('Inference mode requires a base checkpoint.');
            }

            // Training requires epochs
            if ((params.mode === 'training' || params.mode === 'training_and_inference') && !params.epochs) {
                errors.push('Training mode requires epoch count.');
            }

            // Check for queued jobs
            const jobs = await this.manifestService.getJobsWithState();
            const pendingJobs = jobs.filter(j => j.state === 'pending');
            const runningJobs = jobs.filter(j => j.state === 'running');
            if (pendingJobs.length > 0 || runningJobs.length > 0) {
                const total = pendingJobs.length + runningJobs.length;
                warnings.push(
                    `${total} job(s) already in the queue. New job will be queued after existing jobs.`
                );
            }

            return {
                passed: errors.length === 0,
                errors,
                warnings,
                audioStats: { totalPairs, missingRecordings, coveragePercentage },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to analyze audio data: ${msg}`);
            return {
                passed: false,
                errors,
                warnings,
                audioStats: { totalPairs: 0, missingRecordings: 0, coveragePercentage: 0 },
            };
        }
    }

    /**
     * Get total verse count for confirmation display
     */
    private async getTotalVerseCount(): Promise<number> {
        try {
            const summary = await this.audioDiscoveryService.discoverAudio();
            return summary.totalVerses;
        } catch {
            return 0;
        }
    }

    /**
     * Build the confirmation page data from job params and preflight results
     */
    private buildConfirmationData(
        params: JobCreationParams,
        preflight: PreflightCheckResult,
        totalVerses: number
    ): ConfirmationPageData {
        const data: ConfirmationPageData = {
            mode: params.mode,
            modelType: params.modelType,
            baseCheckpoint: params.baseCheckpoint,
            epochs: params.epochs,
            voiceReference: params.voiceReference,
            audioStats: preflight.audioStats,
            warnings: preflight.warnings,
            errors: preflight.errors,
        };

        // Training selection summary
        if (params.mode === 'training' || params.mode === 'training_and_inference') {
            if (params.trainingIncludeVerses && params.trainingIncludeVerses.length > 0) {
                data.trainingSelection = {
                    type: 'include',
                    count: params.trainingIncludeVerses.length,
                    totalCount: totalVerses,
                };
            } else if (params.trainingExcludeVerses && params.trainingExcludeVerses.length > 0) {
                data.trainingSelection = {
                    type: 'exclude',
                    count: params.trainingExcludeVerses.length,
                    totalCount: totalVerses,
                };
            } else {
                data.trainingSelection = {
                    type: 'all',
                    totalCount: totalVerses,
                };
            }
        }

        // Inference selection summary
        if (params.mode === 'inference' || params.mode === 'training_and_inference') {
            if (params.inferenceIncludeVerses && params.inferenceIncludeVerses.length > 0) {
                data.inferenceSelection = {
                    type: 'include',
                    count: params.inferenceIncludeVerses.length,
                    totalCount: totalVerses,
                };
            } else if (params.inferenceExcludeVerses && params.inferenceExcludeVerses.length > 0) {
                data.inferenceSelection = {
                    type: 'exclude',
                    count: params.inferenceExcludeVerses.length,
                    totalCount: totalVerses,
                };
            } else {
                data.inferenceSelection = {
                    type: 'all',
                    totalCount: totalVerses,
                };
            }
        }

        return data;
    }

    /**
     * Show confirmation dialog with job details and preflight checks.
     * This is the legacy method kept for backwards compatibility with extension.ts.
     * The new flow uses the webview confirmation page instead.
     */
    async showConfirmation(
        params: JobCreationParams,
        preflightResult: PreflightCheckResult
    ): Promise<boolean> {
        // This method is no longer used in the new webview flow.
        // The confirmation is handled inside run() via ui.showConfirmation().
        // Kept for API compatibility in case it's called externally.
        const lines: string[] = [];

        lines.push('**Job Configuration:**');
        lines.push(`- Mode: ${params.mode}`);
        lines.push(`- Model: ${params.modelType}`);
        if (params.baseCheckpoint) {
            lines.push(`- Base Checkpoint: ${params.baseCheckpoint}`);
        }
        if (params.epochs) {
            lines.push(`- Epochs: ${params.epochs}`);
        }

        lines.push('');
        lines.push('**Audio Data:**');
        lines.push(`- Total Pairs: ${preflightResult.audioStats.totalPairs}`);
        lines.push(`- Missing Recordings: ${preflightResult.audioStats.missingRecordings}`);
        lines.push(`- Coverage: ${preflightResult.audioStats.coveragePercentage.toFixed(1)}%`);

        if (preflightResult.warnings.length > 0) {
            lines.push('');
            lines.push('**⚠️ Warnings:**');
            preflightResult.warnings.forEach(w => lines.push(`- ${w}`));
        }

        if (preflightResult.errors.length > 0) {
            lines.push('');
            lines.push('**❌ Errors:**');
            preflightResult.errors.forEach(e => lines.push(`- ${e}`));
        }

        const message = lines.join('\n');

        if (!preflightResult.passed) {
            await vscode.window.showErrorMessage(
                'Cannot submit job due to validation errors:\n\n' + message,
                { modal: true }
            );
            return false;
        }

        const action = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Submit Job',
            'Cancel'
        );

        return action === 'Submit Job';
    }
}
