/**
 * Manifest types for GPU job management
 * Based on specification in INITIAL_BUILD_INSTRUCTIONS.md
 */

/**
 * Job mode types
 */
export type JobMode = 'training' | 'inference' | 'training_and_inference';

/**
 * Job state as determined from filesystem
 */
export type JobState = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * TTS model types (extensible for future models)
 */
export type TTSModelType = 'StableTTS';

/**
 * Model configuration for a job
 */
export interface ModelConfig {
    type: TTSModelType;
    base_checkpoint?: string; // Optional path or ID for extending existing model
}

/**
 * Inference configuration
 */
export interface InferenceConfig {
    include_verses?: string[]; // List of verses to include
    exclude_verses?: string[]; // List of verses to exclude
}

/**
 * Individual job definition
 */
export interface Job {
    job_id: string; // Random unique ID
    job_type: 'tts'; // Extensible for future job types
    mode: JobMode;
    model: ModelConfig;
    epochs?: number; // Optional, for training
    inference?: InferenceConfig; // Optional, for inference mode
    voice_reference?: string; // Optional audio file reference
    timeout?: string; // ISO 8601 timestamp, optional
    canceled?: boolean; // User-signaled cancellation
}

/**
 * Top-level manifest structure
 */
export interface Manifest {
    version: number; // Manifest format version
    jobs: Job[];
}

/**
 * Worker response file structure (for reference/parsing)
 */
export interface WorkerResponse {
    worker_id: string; // Unique worker identifier
    state: JobState;
    epochs_completed?: number;
    error_message?: string;
    timestamp?: string; // ISO 8601 timestamp
}

/**
 * Job with computed state (manifest job + filesystem state)
 */
export interface JobWithState extends Job {
    state: JobState;
    worker_id?: string;
    epochs_completed?: number;
    error_message?: string;
}