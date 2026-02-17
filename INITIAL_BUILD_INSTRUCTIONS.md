# Codex Editor GPU Job Plugin – Implementation Specification

## Overview

Implement a **VS Code–compatible extension** for **Codex Editor** (a VS Code fork) that enables users to create and manage **GPU-intensive background jobs**, starting with **TTS model training and inference**.

The plugin operates by:

* Scanning raw project files (not other plugins)
* Generating and updating a **single YAML manifest**
* Sharing the project with a GitLab-based GPU worker
* Tracking job state via filesystem artifacts committed to the repo

The system is intentionally **filesystem- and Git-driven**, with minimal reliance on persistent local state.

---

## Core Concepts

### Plugin Role

* UI for creating and monitoring jobs
* Generate and update `manifest.yaml`
* Perform preflight checks
* Manage GitLab project sharing
* Interpret job state from repository contents

### Worker Role (Out of Scope for Plugin)

* Poll repositories for jobs
* Claim jobs by creating job folders
* Execute training/inference
* Update YAML response files
* Upload resulting models into job folders

---

## Technology Constraints

* **Language:** TypeScript
* **Platform:** VS Code extension API (Codex Editor compatible)
* **Manifest format:** YAML
* **State storage:** Git repository only
* **Logging:** No separate local logs (use manifest + job folders only)

---

## UI / UX

### Sidebar Panel

* New sidebar icon (generic name; not TTS-specific)
* Panel shows:

  * List of existing jobs
  * Job state icons/colors
  * Worker name (if claimed)
  * Epoch progress (if available)
  * Verse range (if inference)

### Creating a Job

* User clicks “New Job”
* Minimal dialog flow
* Confirmation pane before submission showing:

  * Number of audio/text pairs
  * Missing recordings
  * Training vs inference vs both
  * Model selection (new vs existing)
  * Epoch count
  * Inference verse inclusion/exclusion

### Warnings

* Warn if another job is already running (non-blocking)
* Warn if insufficient audio for training

---

## Project Structure Assumptions

### Text & Audio Discovery

* Text files: `./files/target/**/*.codex`
* `.codex` files contain JSON cells
* Audio references are stored inside `.codex` cell JSON
* Audio files themselves do **not** contain metadata
* `.codex` files are the **single source of truth**

No heuristic or filesystem fallback is allowed.

---

## Manifest Design

### Location

```
./gpu_jobs/manifest.yaml
```

### Properties

* Single manifest file
* Contains **multiple jobs**
* Manifest must be **forward-compatible**
* Manifest includes a **version number**

### Required Top-Level Fields

```yaml
version: 1
jobs:
  - job_id: <random unique ID>
    job_type: tts
    mode: training | inference | training_and_inference
    submitted_at: <ISO 8601 timestamp>
    model:
      type: <tts model type>
      base_checkpoint: <optional path or ID>
    epochs: <int, optional>
    training:
      include_verses: <optional list>
      exclude_verses: <optional list>
    inference:
      include_verses: <optional list>
      exclude_verses: <optional list>
    voice_reference: <optional audio file reference>
    timeout: <timestamp, optional>
    canceled: <boolean>
```

Notes:

* Defaults must be assumed by both plugin and worker if fields are missing
* Output paths follow project conventions and are **not specified** in manifest
* Manifest is append-only except for cancel flags or metadata updates

---

## Job Claiming & State Model

### Job Folder

When claimed, the worker creates:

```
./gpu_jobs/job_<job_id>/
  response.yaml
  logs.txt          (optional — worker-produced log output)
  <model files>     (e.g., model_epoch100.pt — produced by training)
```

The plugin checks for the presence of specific files in the job folder:

| File             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `response.yaml`  | Worker state, progress, and result data (see below)                     |
| `logs.txt`       | Worker log output; plugin offers "View Logs" action when this file exists |

### Job State Detection (Filesystem-Based)

| State     | Condition                                  |
| --------- | ------------------------------------------ |
| pending   | No job folder exists                       |
| running   | Job folder exists with worker ID           |
| completed | `response.yaml` says completed             |
| failed    | `response.yaml` says failed                |
| canceled  | Manifest canceled + response says canceled |

No separate "claimed" vs "running" distinction.

---

## Response File (`response.yaml`)

* YAML format
* Required fields:

```yaml
worker_id: <unique worker ID>
state: running | completed | failed | canceled
epochs_completed: <optional int>
error_message: <optional string>
timestamp: <optional, ISO 8601>
result:
  checkpoint_path: <optional, path to trained model checkpoint relative to workspace root>
```

Worker uses `worker_id` to ensure it still owns the job.

### Fields consumed by the plugin

The plugin reads the following keys from `response.yaml` and surfaces them in the UI:

| Key                      | Plugin Usage                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `worker_id`              | Displayed in job tooltip and detail panel; identifies which worker claimed the job                             |
| `state`                  | Primary job state indicator; drives sidebar icons, detail panel badge, and available actions                   |
| `epochs_completed`       | Shown as progress (e.g., "5/100 epochs") in sidebar and detail panel                                         |
| `error_message`          | Displayed in tooltip and detail panel when state is `failed`                                                  |
| `timestamp`              | Shown as "Completed" or "Last Update" time; falls back to `response.yaml` file mtime if absent                |
| `result.checkpoint_path` | Used to discover trained models for fine-tuning and inference (see below)                                     |

### Result Fields

When a training job completes successfully, the worker populates the `result` object:

* `checkpoint_path`: Path to the trained model file (`.pt`), relative to the workspace root (e.g., `gpu_jobs/job_abc123/model_epoch100.pt`). The plugin uses this field to:
  * **Discover available checkpoints** — listed when the user selects a base model for a new training job
  * **"Further Train" action** — pre-fills the new job wizard with this checkpoint as the base model
  * **"Run Inference" action** — pre-fills the new job wizard with this checkpoint for inference
  * The plugin **verifies the checkpoint file exists on disk** before offering it; missing files are silently excluded

## Worker Log File (`logs.txt`)

* Plain text format
* Located at `./gpu_jobs/job_<job_id>/logs.txt`
* Written by the worker during job execution (stdout/stderr capture, progress messages, etc.)
* The plugin checks for the **existence** of this file to conditionally show a "View Logs" button in the job detail panel
* When clicked, the file is opened in the editor as a read-only preview
* This file is **optional** — the plugin functions correctly without it

---

## Cancellation Semantics

Cancellation may occur via:

1. **User-signaled** cancellation (manifest updated)
2. **Technical disconnect** (project unshared, network loss)
3. **Logical disconnect** (job overwritten, manifest inconsistency)

Plugin behavior:

* User cancellation updates manifest
* Plugin assumes worker will eventually observe changes

Worker behavior (for context):

* User-signaled cancel → upload current model state
* Other disconnects → cleanup and exit silently

---

## GitLab Integration

* Plugin uses a **GitLab API token**
   * Further instructions on getting the authentication are available when it is time.
* `gpu_worker` user ID is hard-coded
* Allow override via VS Code settings
* On job creation:

  * Share project with worker
* On completion or timeout:

  * Automatically unshare project

### Timeout

* Optional timestamp in manifest
* Default: far future (e.g., 1 year)
* Plugin unshares project if all active jobs are past timeout

---

## Preflight Checks (Plugin Must Enforce)

Before writing manifest:

* Validate sufficient audio/text pairs
* Ensure selected base model exists (if extending)
* Verify GitLab connectivity and successful project share

If any check fails:

* Do **not** submit job
* Show error to user

---

## Responsibilities Summary

| Responsibility             | Plugin | Worker               |
| -------------------------- | ------ | -------------------- |
| Manifest generation        | ✔      | ✔ (tolerant parsing) |
| Validation defaults        | ✔      | ✔                    |
| Audio sufficiency estimate | ✔      | ✖                    |
| Voice reference selection  | ✔      | ✔ (fallback)         |
| Epoch enforcement          | ✖      | ✔                    |
| Verse selection            | ✔      | ✖                    |
| Cleanup UI                 | ✔      | ✖                    |
| Retry logic                | ✖      | ✖ (user-driven)      |

---

## Extensibility Requirements

* Manifest must support:

  * Multiple job types (TTS now, others later)
  * Multiple TTS model types
* UI should not hard-code assumptions that prevent new job types
* Avoid unnecessary abstraction beyond manifest extensibility
* Manifest `version` allows future breaking changes

---

## Non-Goals (For Now)

* No dry-run mode (confirmation pane only)
* No local logging
* No automatic retry
* No advanced job dependencies
* No interaction with other Codex plugins
