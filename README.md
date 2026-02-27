# Codex Worker

A **VS Code–compatible extension** for **[Codex Editor](https://codexeditor.app/)** that enables users to create and manage **GPU-intensive background jobs**, currently supporting **TTS (Text-to-Speech) model training and inference**, with **ASR (Automatic Speech Recognition)** support planned as a future addition.

The extension operates by scanning raw project files, generating and updating a **single YAML manifest**, sharing the project with a GitLab-based GPU worker, and tracking job state via filesystem artifacts committed to the repo. The system is intentionally **filesystem- and Git-driven**, with minimal reliance on persistent local state.

## Features

### Sidebar Panel

- Dedicated sidebar icon in the Activity Bar for GPU job management
- Lists all existing jobs with state icons/colors
- Shows worker name (if claimed), epoch progress, and verse range details

### Job Creation Wizard

- Step-by-step "New Job" dialog flow
- Confirmation pane before submission showing:
  - Number of audio/text pairs discovered
  - Missing recordings
  - Training vs. inference vs. both
  - Model selection (new or existing checkpoint)
  - Epoch count
  - Inference verse inclusion/exclusion
- Warnings for concurrent running jobs or insufficient audio

### Audio & Text Discovery

- Scans `./files/target/**/*.codex` for text and audio references

### Manifest Generation

- Generates and maintains `./gpu_jobs/manifest.yaml`
- Supports multiple jobs in a single manifest
- Forward-compatible with a version number for future breaking changes
- Append-only (except for cancel flags or metadata updates)

### Job State Tracking

Job state is detected purely from the filesystem:

| State     | Condition                                  |
| --------- | ------------------------------------------ |
| Pending   | No job folder exists                       |
| Running   | Job folder exists with worker ID           |
| Completed | `response.yaml` says completed             |
| Failed    | `response.yaml` says failed                |
| Canceled  | Manifest canceled + response says canceled |

### GitLab Integration

- Uses a GitLab API token for authentication
- Shares the project with the GPU worker on job creation
- Automatically unshares the project on completion or timeout

### Preflight Validation

Before writing the manifest, the extension validates:

- Sufficient audio/text pairs
- Selected base model exists (if extending)
- GitLab connectivity and successful project share

## Extension Settings

| Setting                       | Type   | Default | Description                          |
| ----------------------------- | ------ | ------- | ------------------------------------ |
| `codex-worker.workerUserId`   | number | 551     | GitLab user ID of the GPU worker     |

## Commands

| Command                                  | Description                        |
| ---------------------------------------- | ---------------------------------- |
| **GPU Jobs: Test GitLab Connection**     | Verify GitLab connectivity         |
| **GPU Jobs: Test Audio Discovery**       | Test audio file discovery          |
| **New Job**                              | Create a new GPU job               |
| **Refresh Jobs**                         | Refresh the jobs list              |
| **Cancel Job**                           | Cancel a running job               |

## Extensibility

- The manifest supports multiple job types (TTS currently; ASR and others planned)
- Multiple TTS model types can be supported currently only [StableTTS](https://github.com/KdaiP/StableTTS).
- The UI avoids hard-coded assumptions that would prevent new job types
- The manifest `version` field allows future breaking changes
- The [codex-job-worker backend](https://github.com/JEdward7777/codex-job-worker) already has ASR via Wav2Vec2-BERT in the works — frontend integration is a planned future addition
- See the [codex-job-worker manifest documentation](https://github.com/JEdward7777/codex-job-worker#job-manifest-system) for the full manifest format specification

## Technology

- **Language:** TypeScript
- **Platform:** VS Code Extension API (Codex Editor compatible)
- **Manifest format:** YAML
- **State storage:** Git repository only

## Building

```bash
# Compile (development)
npm run compile

# Watch mode
npm run watch

# Production build
npm run package

# Create .vsix file
npm run vsix
```

## Privacy & Data Handling

When you submit a GPU job, your project data is temporarily shared with a remote processing server. Results are uploaded back to your project, access is revoked after completion, and server data is purged after a limited maintenance window. Your data is never used for other projects without your explicit permission.

For full details, see [PRIVACY.md](PRIVACY.md). You can also view the privacy policy at any time by clicking the 🛡️ shield icon in the GPU Jobs sidebar title bar.

## Related Projects

- **[codex-job-worker](https://github.com/JEdward7777/codex-job-worker)** — The GPU worker backend that processes jobs created by this extension. It claims jobs from the YAML manifest, executes TTS/ASR training and inference, and uploads results back to GitLab.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Release Notes

### 0.0.1

Initial development release with TTS job management, audio discovery, manifest generation, GitLab integration, and preflight validation.
