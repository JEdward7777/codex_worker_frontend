# Codex Worker — Data Privacy Policy

**Policy Version:** 1
**Last Updated:** 2026-02-27

## Overview

The Codex Worker extension submits GPU-intensive processing jobs (such as model training and inference) on your behalf. This requires temporarily sharing your project data with a remote processing server. This document explains exactly what happens to your data during that process.

## What Data Is Shared

When you submit a job, the following project data may be transferred to the processing server:

- **Audio recordings** used for training or as voice references
- **Text data** (cell/verse content) used for training or inference
- **Configuration files** (job manifest, model checkpoints) needed to execute the job

Only data relevant to the submitted job is accessed by the processing server.

## How Your Data Is Processed

| Step | What Happens |
|------|-------------|
| **1. Project Sharing** | Your GitLab project is shared with a GPU worker service account, granting it temporary read/write access. |
| **2. Data Transfer** | The worker downloads the relevant project data to a remote processing server. |
| **3. Job Execution** | The server performs the requested processing (e.g., model training, inference). |
| **4. Results Upload** | Results (such as trained model checkpoints or generated output) are uploaded back to your GitLab project. |
| **5. Access Revocation** | The GPU worker's access to your project is automatically revoked, typically within approximately 24 hours of job completion. |
| **6. Server Cleanup** | Residual data on the processing server is purged after a limited maintenance window. |

## Data Retention

- **Your GitLab project:** Results are committed to your repository and remain under your control.
- **Processing server:** Project data is not permanently stored. Residual data may remain for a limited maintenance window after job completion but is eventually purged.
- **No permanent server-side copies:** The processing server does not retain long-term copies of your project data.

## What We Do NOT Do

- ❌ **No secondary use:** Your data is never used to train models for other projects or users without your explicit permission.
- ❌ **No third-party sharing:** Your data is not shared with any parties beyond the processing infrastructure required to execute your job.
- ❌ **No permanent retention:** Project data is not permanently stored on processing servers.

## Future Considerations

As the service evolves, the following may be introduced:

- **Billing records** to track job usage for accounting purposes.
- **Anonymous, aggregated usage metrics** to help improve service reliability and performance. These metrics would not contain identifiable project content.

Any material changes to this policy will be communicated through an updated policy version, and you may be asked to re-acknowledge the updated terms.

## Consent

By submitting a job through the Codex Worker extension, you acknowledge and consent to the data handling described in this policy. You will be asked to confirm this consent before your first job submission.

## Questions

If you have questions about how your data is handled, please contact the project maintainers.

<!-- NOTE: A summary of this policy is also displayed in the job submission
     confirmation page. If you update this file, also review the summary text
     in src/constants/privacy.ts to ensure consistency. -->
