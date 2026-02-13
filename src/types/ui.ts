/**
 * UI-related type definitions for the GPU Jobs extension
 */

import { JobState } from './manifest';

/**
 * Extended job information for UI display
 */
export interface JobDisplayInfo {
    jobId: string;
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
    mode: 'training' | 'inference' | 'training_and_inference';
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    inferenceIncludeVerses?: string[];
    inferenceExcludeVerses?: string[];
    trainingIncludeVerses?: string[];
    trainingExcludeVerses?: string[];
    voiceReference?: string;
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
    /** Selection mode: include or exclude */
    selectionMode: 'include' | 'exclude';
    /** Whether to show the "hide already recorded" checkbox (inference include only) */
    showHideRecorded: boolean;
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
}

/**
 * Result returned from the verse selector
 */
export interface VerseSelectionResult {
    /** The cell IDs that were selected */
    selectedIds: string[];
}

/**
 * Data sent to the confirmation page
 */
export interface ConfirmationPageData {
    mode: string;
    modelType: string;
    baseCheckpoint?: string;
    epochs?: number;
    voiceReference?: string;
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
    selectionMode: 'include' | 'exclude';
    showHideRecorded: boolean;
}

/**
 * Confirmation page task
 */
export interface ConfirmationTask extends WebviewTaskBase {
    taskType: 'confirmation';
    data: ConfirmationPageData;
}

/**
 * Union of all task types
 */
export type WebviewTask = QuickPickTask | InputBoxTask | VerseSelectorTask | ConfirmationTask;

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
