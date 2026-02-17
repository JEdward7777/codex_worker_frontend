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
 * Training configuration
 */
export interface TrainingConfig {
    include_verses?: string[]; // List of verses to include in training
    exclude_verses?: string[]; // List of verses to exclude from training
}

/**
 * Inference configuration
 */
export interface InferenceConfig {
    include_verses?: string[]; // List of verses to include in inference
    exclude_verses?: string[]; // List of verses to exclude from inference
}

/**
 * Individual job definition
 */
export interface Job {
    job_id: string; // Random unique ID
    job_type: 'tts'; // Extensible for future job types
    mode: JobMode;
    submitted_at: string; // ISO 8601 timestamp of when the job was defined
    model: ModelConfig;
    epochs?: number; // Optional, for training
    training?: TrainingConfig; // Optional, for training mode
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
 * Result data from a completed job
 */
export interface JobResult {
    checkpoint_path?: string; // Path to the trained model checkpoint, relative to workspace root
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
    result?: JobResult; // Result data including checkpoint path
}

/**
 * Job with computed state (manifest job + filesystem state)
 */
export interface JobWithState extends Job {
    state: JobState;
    worker_id?: string;
    epochs_completed?: number;
    error_message?: string;
    response_timestamp?: string; // ISO 8601 timestamp from the worker response file
}

/**
 * Information about an available checkpoint from a completed job
 */
export interface CheckpointInfo {
    jobId: string;
    checkpointPath: string; // Relative to workspace root
    modelType: string;
    epochs?: number; // Requested epoch count from manifest
    timestamp?: string; // Completion timestamp from response.yaml
    fileTimestamp?: Date; // File modification time of response.yaml (fallback)
    filtered: boolean; // Whether the job had include/exclude verses set
}