/**
 * Multi-step wizard for creating new GPU jobs
 */

import * as vscode from 'vscode';
import { JobCreationParams, PreflightCheckResult } from '../types/ui';
import { Job, JobMode, TTSModelType } from '../types/manifest';
import { AudioDiscoveryService } from '../services/AudioDiscoveryService';
import { ManifestService } from '../services/ManifestService';

/**
 * Wizard for creating new jobs
 */
export class NewJobWizard {
    constructor(
        private audioDiscoveryService: AudioDiscoveryService,
        private manifestService: ManifestService
    ) {}

    /**
     * Run the job creation wizard
     * Returns the created job parameters or null if canceled
     */
    async run(): Promise<JobCreationParams | null> {
        try {
            // Step 1: Select job mode
            const mode = await this.selectMode();
            if (!mode) {
                return null;
            }

            // Step 2: Select model type
            const modelType = await this.selectModelType();
            if (!modelType) {
                return null;
            }

            // Step 3: Select base checkpoint (optional)
            const baseCheckpoint = await this.selectBaseCheckpoint(mode);
            if (baseCheckpoint === undefined) {
                return null; // User canceled
            }

            // Step 4: Select epochs (if training)
            let epochs: number | undefined;
            if (mode === 'training' || mode === 'training_and_inference') {
                epochs = await this.selectEpochs();
                if (epochs === undefined) {
                    return null;
                }
            }

            // Step 5: Select verses (if inference)
            let includeVerses: string[] | undefined;
            let excludeVerses: string[] | undefined;
            if (mode === 'inference' || mode === 'training_and_inference') {
                const verseSelection = await this.selectVerses();
                if (!verseSelection) {
                    return null;
                }
                includeVerses = verseSelection.include;
                excludeVerses = verseSelection.exclude;
            }

            // Step 6: Select voice reference (optional)
            const voiceReference = await this.selectVoiceReference();
            if (voiceReference === undefined) {
                return null;
            }

            return {
                mode,
                modelType,
                baseCheckpoint: baseCheckpoint || undefined,
                epochs,
                includeVerses,
                excludeVerses,
                voiceReference: voiceReference || undefined
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create job: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Step 1: Select job mode
     */
    private async selectMode(): Promise<JobMode | null> {
        const items: vscode.QuickPickItem[] = [
            {
                label: 'Training',
                description: 'Train a new TTS model',
                detail: 'Creates a new model or fine-tunes an existing one'
            },
            {
                label: 'Inference',
                description: 'Generate audio from text',
                detail: 'Uses an existing model to synthesize speech'
            },
            {
                label: 'Training and Inference',
                description: 'Train then generate audio',
                detail: 'Trains a model and then runs inference on selected verses'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Select Job Mode',
            placeHolder: 'What would you like to do?'
        });

        if (!selected) {
            return null;
        }

        const modeMap: Record<string, JobMode> = {
            'Training': 'training',
            'Inference': 'inference',
            'Training and Inference': 'training_and_inference'
        };

        return modeMap[selected.label];
    }

    /**
     * Step 2: Select model type
     */
    private async selectModelType(): Promise<TTSModelType | null> {
        const items: vscode.QuickPickItem[] = [
            {
                label: 'StableTTS',
                description: 'Stable Text-to-Speech model',
                detail: 'High-quality TTS with good stability'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Select Model Type',
            placeHolder: 'Which TTS model would you like to use?'
        });

        if (!selected) {
            return null;
        }

        return selected.label as TTSModelType;
    }

    /**
     * Step 3: Select base checkpoint (optional)
     */
    private async selectBaseCheckpoint(mode: JobMode): Promise<string | null | undefined> {
        // For inference-only, base checkpoint is required
        // For training, it's optional (fine-tuning vs new model)
        const isRequired = mode === 'inference';

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(new-file) Train New Model',
                description: 'Start from scratch',
                detail: 'Create a brand new model without a base checkpoint'
            },
            {
                label: '$(file) Use Existing Model',
                description: 'Fine-tune or use existing',
                detail: 'Select a previously trained model as the base'
            }
        ];

        // For inference, remove the "new model" option
        const availableItems = isRequired ? items.slice(1) : items;

        const selected = await vscode.window.showQuickPick(availableItems, {
            title: 'Base Model',
            placeHolder: isRequired
                ? 'Select an existing model for inference'
                : 'Start from scratch or fine-tune an existing model?'
        });

        if (!selected) {
            return undefined; // Canceled
        }

        if (selected.label.includes('New Model')) {
            return null; // No base checkpoint
        }

        // Let user enter the checkpoint path/ID
        const checkpoint = await vscode.window.showInputBox({
            title: 'Base Checkpoint',
            prompt: 'Enter the path or ID of the base model checkpoint',
            placeHolder: 'e.g., models/my-model-epoch-100.pt or job_abc123',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Checkpoint path cannot be empty';
                }
                return null;
            }
        });

        return checkpoint || undefined;
    }

    /**
     * Step 4: Select number of epochs
     */
    private async selectEpochs(): Promise<number | undefined> {
        const epochStr = await vscode.window.showInputBox({
            title: 'Training Epochs',
            prompt: 'How many epochs should the model train for?',
            value: '100',
            validateInput: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num <= 0) {
                    return 'Please enter a positive number';
                }
                if (num > 10000) {
                    return 'Epoch count seems too high (max: 10000)';
                }
                return null;
            }
        });

        if (!epochStr) {
            return undefined;
        }

        return parseInt(epochStr, 10);
    }

    /**
     * Step 5: Select cells for inference
     */
    private async selectVerses(): Promise<{ include?: string[]; exclude?: string[] } | null> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(check-all) All Cells',
                description: 'Generate audio for all cells',
                detail: 'Process every cell in the project'
            },
            {
                label: '$(list-selection) Specific Cells',
                description: 'Choose which cells to include/exclude',
                detail: 'Manually specify cell references'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Cell Selection',
            placeHolder: 'Which cells should be processed?'
        });

        if (!selected) {
            return null;
        }

        if (selected.label.includes('All Cells')) {
            return {}; // No filters
        }

        // Ask if they want to include or exclude
        const filterType = await vscode.window.showQuickPick([
            {
                label: 'Include Specific Cells',
                description: 'Only process these cells'
            },
            {
                label: 'Exclude Specific Cells',
                description: 'Process all except these cells'
            }
        ], {
            title: 'Filter Type',
            placeHolder: 'Include or exclude cells?'
        });

        if (!filterType) {
            return null;
        }

        const isInclude = filterType.label.includes('Include');

        const versesInput = await vscode.window.showInputBox({
            title: isInclude ? 'Include Cells' : 'Exclude Cells',
            prompt: 'Enter cell references (comma-separated)',
            placeHolder: 'e.g., JHN 1:1, cf5a575d-84e2-6dee-0e3a-06b719bcae7a, MAT 5:1',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter at least one cell reference';
                }
                // Basic validation - could be more sophisticated
                return null;
            }
        });

        if (!versesInput) {
            return null;
        }

        // Parse the comma-separated list
        const verses = versesInput
            .split(',')
            .map(v => v.trim())
            .filter(v => v.length > 0);

        return isInclude
            ? { include: verses }
            : { exclude: verses };
    }

    /**
     * Step 6: Select voice reference (optional)
     */
    private async selectVoiceReference(): Promise<string | null | undefined> {
        const useReference = await vscode.window.showQuickPick([
            {
                label: '$(pass) Use Default Voice',
                description: 'No specific voice reference'
            },
            {
                label: '$(mic) Specify Voice Reference',
                description: 'Use a specific audio file as reference'
            }
        ], {
            title: 'Voice Reference',
            placeHolder: 'Use a specific voice reference?'
        });

        if (!useReference) {
            return undefined;
        }

        if (useReference.label.includes('Default')) {
            return null;
        }

        const reference = await vscode.window.showInputBox({
            title: 'Voice Reference',
            prompt: 'Enter the path to the voice reference audio file',
            placeHolder: 'e.g., .project/attachments/files/JHN/audio-1.webm',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter a file path';
                }
                return null;
            }
        });

        return reference || undefined;
    }

    /**
     * Show confirmation dialog with job details and preflight checks
     */
    async showConfirmation(
        params: JobCreationParams,
        preflightResult: PreflightCheckResult
    ): Promise<boolean> {
        const lines: string[] = [];

        // Job configuration
        lines.push('**Job Configuration:**');
        lines.push(`- Mode: ${params.mode}`);
        lines.push(`- Model: ${params.modelType}`);
        if (params.baseCheckpoint) {
            lines.push(`- Base Checkpoint: ${params.baseCheckpoint}`);
        }
        if (params.epochs) {
            lines.push(`- Epochs: ${params.epochs}`);
        }
        if (params.voiceReference) {
            lines.push(`- Voice Reference: ${params.voiceReference}`);
        }

        lines.push('');

        // Audio statistics
        lines.push('**Audio Data:**');
        lines.push(`- Total Pairs: ${preflightResult.audioStats.totalPairs}`);
        lines.push(`- Missing Recordings: ${preflightResult.audioStats.missingRecordings}`);
        lines.push(`- Coverage: ${preflightResult.audioStats.coveragePercentage.toFixed(1)}%`);

        lines.push('');

        // Cell selection
        if (params.includeVerses && params.includeVerses.length > 0) {
            lines.push(`**Include Cells:** ${params.includeVerses.length} cells`);
        }
        if (params.excludeVerses && params.excludeVerses.length > 0) {
            lines.push(`**Exclude Cells:** ${params.excludeVerses.length} cells`);
        }

        // Warnings
        if (preflightResult.warnings.length > 0) {
            lines.push('');
            lines.push('**⚠️ Warnings:**');
            preflightResult.warnings.forEach(warning => {
                lines.push(`- ${warning}`);
            });
        }

        // Errors
        if (preflightResult.errors.length > 0) {
            lines.push('');
            lines.push('**❌ Errors:**');
            preflightResult.errors.forEach(error => {
                lines.push(`- ${error}`);
            });
        }

        const message = lines.join('\n');

        // If there are errors, show error message and don't allow submission
        if (!preflightResult.passed) {
            await vscode.window.showErrorMessage(
                'Cannot submit job due to validation errors:\n\n' + message,
                { modal: true }
            );
            return false;
        }

        // Show confirmation dialog
        const action = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Submit Job',
            'Cancel'
        );

        return action === 'Submit Job';
    }
}