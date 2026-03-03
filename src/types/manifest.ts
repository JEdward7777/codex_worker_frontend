/**
 * Manifest types for GPU job management
 * Based on specification in INITIAL_BUILD_INSTRUCTIONS.md
 */

/**
 * Supported job types
 */
export type JobType = 'tts' | 'asr';

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
 * ASR model types (extensible for future models)
 */
export type ASRModelType = 'W2V2BERT';

/**
 * Union of all model types across job types
 */
export type ModelType = TTSModelType | ASRModelType;

/**
 * Model configuration for a job
 */
export interface ModelConfig {
    type: ModelType;
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
 * SentenceTransmorgrifier configuration (ASR post-processing)
 */
export interface TransmorgrifierConfig {
    enabled: boolean; // Whether to use SentenceTransmorgrifier post-processing
}

/**
 * Individual job definition
 */
export interface Job {
    job_id: string; // Random unique ID
    name?: string; // Optional human-readable name for the job
    description?: string; // Optional description of the job's purpose
    job_type: JobType; // 'tts' or 'asr'
    mode: JobMode;
    submitted_at: string; // ISO 8601 timestamp of when the job was defined
    model: ModelConfig;
    epochs?: number; // Optional, for training
    training?: TrainingConfig; // Optional, for training mode
    inference?: InferenceConfig; // Optional, for inference mode
    voice_reference?: string; // Optional audio file reference (TTS only)
    transmorgrifier?: TransmorgrifierConfig; // Optional ASR post-processing config
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
    jobName?: string; // Human-readable name of the job that produced this checkpoint
    checkpointPath: string; // Relative to workspace root
    modelType: string;
    epochs?: number; // Requested epoch count from manifest
    timestamp?: string; // Completion timestamp from response.yaml
    fileTimestamp?: Date; // File modification time of response.yaml (fallback)
    filtered: boolean; // Whether the job had include/exclude verses set
}