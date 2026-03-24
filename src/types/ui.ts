/**
 * UI-related type definitions for the GPU Jobs extension
 */

import { JobState, JobType } from './manifest';

/**
 * Extended job information for UI display
 */
export interface JobDisplayInfo {
    jobId: string;
    name?: string;
    description?: string;
    jobType: string;
    mode: string;
    state: JobState;
    workerId?: string;
    epochsCompleted?: number;
    totalEpochs?: number;
    verseRange?: string;
    errorMessage?: string;
    timestamp?: string;
    canceled: boolean;
}

/**
 * Job creation parameters from the UI wizard
 */
export interface JobCreationParams {
    jobType: JobType;
    name?: string;
    description?: string;
    mode: 'training' | 'inference' | 'training_and_inference';
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    inferenceIncludeVerses?: string[];
    inferenceExcludeVerses?: string[];
    trainingIncludeVerses?: string[];
    trainingExcludeVerses?: string[];
    voiceReference?: string;
    transmorgrifierEnabled?: boolean; // ASR post-processing option
    timeout?: string;
}

/**
 * Preflight check results
 */
export interface PreflightCheckResult {
    passed: boolean;
    errors: string[];
    warnings: string[];
    audioStats: {
        totalPairs: number;
        missingRecordings: number;
        coveragePercentage: number;
    };
}

/**
 * Job confirmation data shown before submission
 */
export interface JobConfirmationData {
    jobType: JobType;
    mode: string;
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    audioPairs: number;
    missingRecordings: number;
    coveragePercentage: number;
    inferenceIncludeVerses?: string[];
    inferenceExcludeVerses?: string[];
    trainingIncludeVerses?: string[];
    trainingExcludeVerses?: string[];
    transmorgrifierEnabled?: boolean;
    warnings: string[];
}

// ============================================================
// Webview Task/Response Protocol Types
// ============================================================

/**
 * A QuickPick item compatible with vscode.QuickPickItem shape
 */
export interface WebviewQuickPickItem {
    label: string;
    description?: string;
    detail?: string;
}

/**
 * Options for the verse selector component
 */
export interface VerseSelectorOptions {
    /** Phase label: 'Training' or 'Inference' */
    phase: string;
    /** Selection mode: include, exclude, or single-audio (for reference audio selection) */
    selectionMode: 'include' | 'exclude' | 'single-audio';
    /** Whether to show the "hide already recorded" checkbox (inference include only) */
    showHideRecorded: boolean;
    /** Whether to show play buttons for audio preview (requires hasLocalAudio on items) */
    showPlayButton?: boolean;
    /** Whether to show a Skip button for optional selections */
    allowSkip?: boolean;
}

/**
 * A verse item sent to the webview for display in the verse selector
 */
export interface VerseSelectorItem {
    /** Cell ID (used as the unique key) */
    cellId: string;
    /** Display reference: verseRef if available, otherwise cellId */
    displayRef: string;
    /** Whether this cell has an audio recording */
    hasAudio: boolean;
    /** Whether the actual audio file exists locally for playback */
    hasLocalAudio?: boolean;
    /** Absolute path to the audio file in the files/ folder (for playback via webview URI) */
    audioFilePath?: string;
}

/**
 * Result returned from the verse selector
 */
export interface VerseSelectionResult {
    /** The cell IDs that were selected */
    selectedIds: string[];
    /** For single-audio mode: the selected audio path (pointers/ path for GPU worker) */
    selectedAudioPath?: string;
}

/**
 * Data sent to the confirmation page
 */
export interface ConfirmationPageData {
    jobType: JobType;
    name?: string;
    description?: string;
    mode: string;
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    voiceReference?: string;
    transmorgrifierEnabled?: boolean;
    trainingSelection?: {
        type: 'all' | 'include' | 'exclude';
        count?: number;
        totalCount: number;
    };
    inferenceSelection?: {
        type: 'all' | 'include' | 'exclude';
        count?: number;
        totalCount: number;
        overwriteCount?: number;
    };
    audioStats: {
        totalPairs: number;
        missingRecordings: number;
        coveragePercentage: number;
    };
    warnings: string[];
    errors: string[];
    /** Short privacy summary text shown on the confirmation page */
    privacySummary?: string;
    /** Whether the user has previously consented to the current privacy policy version */
    privacyPreviouslyConsented?: boolean;
}

// ============================================================
// Training Metrics Types
// ============================================================

/**
 * Parsed training metrics data from a CSV file.
 * Each row represents one epoch's worth of loss values.
 */
export interface TrainingMetricsData {
    /** Column headers from the CSV (excluding 'epoch') */
    columns: string[];
    /** Epoch numbers (X-axis values) */
    epochs: number[];
    /** Loss values keyed by column name, each array parallel to epochs[]. null = missing data point. */
    series: Record<string, (number | null)[]>;
    /** Whether the known primary columns (train_total_loss, val_total_loss) are present */
    hasPrimaryColumns: boolean;
}

// ============================================================
// Job Detail Types
// ============================================================

/**
 * Actions available from the job detail view
 */
export type JobDetailAction =
    | 'cancel-job'
    | 'delete-job'
    | 'further-train'
    | 'run-inference'
    | 'clone-job'
    | 'view-logs'
    | 'open-job-folder';

/**
 * Data sent to the job detail view for rendering
 */
export interface JobDetailData {
    jobId: string;
    name?: string;
    description?: string;
    jobType: string;
    mode: string;
    state: JobState;
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    epochsCompleted?: number;
    workerId?: string;
    submittedAt?: string;
    responseTimestamp?: string;
    errorMessage?: string;
    statusMessage?: string;
    canceled: boolean;
    trainingVerseCount?: number;
    inferenceVerseCount?: number;
    voiceReference?: string;
    /** Whether the job folder exists on disk (for view-logs / open-folder actions) */
    hasJobFolder: boolean;
    /** Which actions are valid for this job's current state */
    availableActions: JobDetailAction[];
    /** Training metrics data parsed from CSV, if available */
    trainingMetrics?: TrainingMetricsData;
}

// ============================================================
// Webview Message Protocol
// ============================================================

/**
 * Base task message sent from extension to webview
 */
export interface WebviewTaskBase {
    type: 'task';
    taskId: string;
    taskType: string;
}

/**
 * QuickPick task
 */
export interface QuickPickTask extends WebviewTaskBase {
    taskType: 'quickpick';
    items: WebviewQuickPickItem[];
    title?: string;
    placeHolder?: string;
}

/**
 * InputBox task
 */
export interface InputBoxTask extends WebviewTaskBase {
    taskType: 'inputbox';
    title?: string;
    prompt?: string;
    value?: string;
    placeHolder?: string;
    validationRegex?: string;
    validationMessage?: string;
}

/**
 * Verse selector task
 */
export interface VerseSelectorTask extends WebviewTaskBase {
    taskType: 'verse-selector';
    verses: VerseSelectorItem[];
    phase: string;
    selectionMode: 'include' | 'exclude' | 'single-audio';
    showHideRecorded: boolean;
    showPlayButton?: boolean;
    allowSkip?: boolean;
}

/**
 * Confirmation page task
 */
export interface ConfirmationTask extends WebviewTaskBase {
    taskType: 'confirmation';
    data: ConfirmationPageData;
}

/**
 * Job detail task
 */
export interface JobDetailTask extends WebviewTaskBase {
    taskType: 'job-detail';
    data: JobDetailData;
}

/**
 * Union of all task types
 */
export type WebviewTask = QuickPickTask | InputBoxTask | VerseSelectorTask | ConfirmationTask | JobDetailTask;

/**
 * Response message sent from webview to extension
 */
export interface WebviewResponse {
    type: 'response';
    taskId: string;
    taskType: string;
    result: any;
}

/**
 * Cancel message sent from webview to extension
 */
export interface WebviewCancel {
    type: 'cancel';
    taskId: string;
}

/**
 * Union of all messages from webview to extension
 */
export type WebviewMessage = WebviewResponse | WebviewCancel;
