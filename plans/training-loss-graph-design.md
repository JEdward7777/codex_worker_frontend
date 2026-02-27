# Training Loss Graph Feature Design

> **IMPORTANT**: This document contains the complete specification for the training loss graph feature.
> Keep a reference to `plans/training-loss-graph-design.md` in any context summary.

## Overview

Add training and validation loss graphs to the existing JobDetailPanel, allowing users to visualize model training performance for GPU jobs that have a `training_metrics.csv` file.

## Data Source

- **File**: `gpu_jobs/job_<job_id>/checkpoint/training_metrics.csv`
- **Format**: CSV with header row
- **Known columns**: `epoch`, `train_total_loss`, `train_diff_loss`, `train_dur_loss`, `train_prior_loss`, `val_total_loss`, `val_diff_loss`, `val_dur_loss`, `val_prior_loss`
- **Timing**: File appears after job completion (static data, no live updates needed)

### Example CSV

```csv
epoch,train_total_loss,train_diff_loss,train_dur_loss,train_prior_loss,val_total_loss,val_diff_loss,val_dur_loss,val_prior_loss
0,2.280681,0.615405,0.47219,1.193086,3.304064,1.39991,0.572892,1.331261
1,2.299603,0.621837,0.479768,1.197998,3.35889,1.438338,0.580191,1.34036
```

## UI Placement

- Integrated into the existing **JobDetailPanel** webview
- Positioned at the **bottom**, after all existing job metadata and action buttons
- Section title: "Training Metrics"

## Display Logic (Resilience Rules)

1. **File doesn't exist**: Don't show the graph section at all
2. **File exists but is empty / no data rows**: Don't show the graph section
3. **Known columns exist** (`train_total_loss` AND `val_total_loss`):
   - Show primary graph with just these two lines by default
   - Show explanatory text describing what the metrics mean
   - Show a checkbox: "Show detailed metrics" to reveal all sub-loss lines on the SAME graph
   - Y-axis re-scales when checkbox is toggled to fit all visible lines
4. **Known columns missing** (but other numeric columns exist):
   - Show all available numeric columns by default (no checkbox, no explanations)
   - Just display whatever data is available
5. **Partial columns**: Handle gracefully — only plot columns that exist
6. **Job state**: Show graph for ANY job state where the CSV file exists on disk

## Graph Implementation

- **Technology**: Custom SVG (no external dependencies — no Chart.js)
- **Chart type**: Line chart
- **X-axis**: Epoch number
- **Y-axis**: Loss value, auto-scaled to fit visible data range (with ~5% padding)
- **Y-axis rescaling**: Recalculates min/max when "Show detailed metrics" checkbox is toggled
- **Dimensions**: Responsive width (fills container), fixed 400px height
- **Interactivity**: Hover tooltips showing exact epoch and loss value
- **Legend**: Color-coded legend showing which line is which
- **Best validation loss marker**: ★ star at the epoch with the lowest `val_total_loss`, with annotation showing the value and epoch number. Only shown when `val_total_loss` is visible. Label positioned to the right of the star (or left if near the right edge of the chart).

## Styling

- Follow VS Code theme colors using CSS variables:
  - `--vscode-editor-foreground` for axis lines and labels
  - `--vscode-editor-background` for chart background
  - `--vscode-descriptionForeground` for secondary text / explanations
  - `--vscode-focusBorder` for interactive elements (checkbox)
  - `--vscode-checkbox-background`, `--vscode-checkbox-border` for the checkbox
- Distinct line colors that work in both dark and light themes
- Match existing `wizard.css` styling conventions

## Explanatory Text

When `train_total_loss` and `val_total_loss` are present, show below the graph:

> **Training Loss**: How well the model fits the training data. Lower values indicate the model is learning the patterns in your audio data.
>
> **Validation Loss**: How well the model generalizes to unseen data. Lower values are better. If validation loss rises while training loss continues to fall, the model may be overfitting — memorizing the training data rather than learning generalizable patterns.

## Color Palette for Lines

Chosen for visibility in both dark and light VS Code themes:

| Metric | Color | Style |
|--------|-------|-------|
| train_total_loss | `#4fc3f7` (light blue) | Solid, 2px |
| val_total_loss | `#ff8a65` (orange) | Solid, 2px |
| train_diff_loss | `#81c784` (green) | Solid, 1.5px |
| train_dur_loss | `#ba68c8` (purple) | Solid, 1.5px |
| train_prior_loss | `#fff176` (yellow) | Solid, 1.5px |
| val_diff_loss | `#e57373` (red) | Solid, 1.5px |
| val_dur_loss | `#4db6ac` (teal) | Solid, 1.5px |
| val_prior_loss | `#a1887f` (brown) | Solid, 1.5px |

## Architecture / Integration Points

### Extension Side (TypeScript)

1. **JobDetailPanel.ts**: Read the CSV file, parse it, and include the metrics data in the `JobDetailData` payload sent to the webview
2. **Types (ui.ts)**: Add `trainingMetrics` field to `JobDetailData` interface
3. **CSV Parsing**: Simple custom parser (split by newlines, split by commas) — no library needed

### Webview Side (JavaScript)

1. **wizard.js**: Add handler for rendering the training metrics section in the `job-detail` task type
2. **SVG Graph Renderer**: New function(s) in wizard.js to generate SVG line charts from the metrics data
3. **wizard.css**: Add styles for the graph section, legend, tooltips, and checkbox

### Data Flow

```
CSV file on disk
  → JobDetailPanel reads & parses CSV
  → Sends parsed data as part of JobDetailData via postMessage
  → wizard.js receives data and renders SVG graph in the job-detail view
```

## Files to Modify

1. `src/types/ui.ts` — Add `TrainingMetrics` type and `trainingMetrics` field to `JobDetailData`
2. `src/ui/JobDetailPanel.ts` — Read/parse CSV, include in detail data
3. `media/wizard.js` — SVG graph rendering logic in job-detail handler
4. `media/wizard.css` — Graph section styles

## Implementation Order

1. Add types to `src/types/ui.ts`
2. Add CSV reading/parsing to `src/ui/JobDetailPanel.ts`
3. Add graph rendering to `media/wizard.js`
4. Add styles to `media/wizard.css`
5. Test with real CSV data
