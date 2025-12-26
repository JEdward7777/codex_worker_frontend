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
    includeVerses?: string[];
    excludeVerses?: string[];
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
    includeVerses?: string[];
    excludeVerses?: string[];
    warnings: string[];
}