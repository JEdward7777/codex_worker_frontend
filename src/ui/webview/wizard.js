/**
 * Wizard Webview — Task Renderer & Dispatcher
 *
 * This script runs inside the VS Code webview. It listens for task messages
 * from the extension, renders the appropriate UI, and sends back responses.
 *
 * The extension drives the control flow; this is a stateless render-and-respond terminal.
 */

// @ts-nocheck
/* global acquireVsCodeApi */

(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const root = document.getElementById('wizard-root');

    /** Current task ID (for response correlation) */
    let currentTaskId = null;
    /** Current task type */
    let currentTaskType = null;

    // ================================================================
    // Message handling
    // ================================================================

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'task') {
            currentTaskId = message.taskId;
            currentTaskType = message.taskType;
            renderTask(message);
        }
    });

    /**
     * Send a response back to the extension
     * @param {any} result
     */
    function respond(result) {
        if (!currentTaskId) { return; }
        vscode.postMessage({
            type: 'response',
            taskId: currentTaskId,
            taskType: currentTaskType,
            result: result,
        });
        currentTaskId = null;
        currentTaskType = null;
    }

    /**
     * Send a cancel message back to the extension
     */
    function cancel() {
        if (!currentTaskId) { return; }
        vscode.postMessage({
            type: 'cancel',
            taskId: currentTaskId,
        });
        currentTaskId = null;
        currentTaskType = null;
    }

    // ================================================================
    // Task dispatcher
    // ================================================================

    /**
     * Render the appropriate UI for a task
     * @param {object} task
     */
    function renderTask(task) {
        root.innerHTML = '';
        switch (task.taskType) {
            case 'quickpick':
                renderQuickPick(task);
                break;
            case 'inputbox':
                renderInputBox(task);
                break;
            case 'verse-selector':
                renderVerseSelector(task);
                break;
            case 'confirmation':
                renderConfirmation(task);
                break;
            default:
                root.innerHTML = '<div class="loading-container">Unknown task type</div>';
        }
    }

    // ================================================================
    // QuickPick component
    // ================================================================

    /**
     * Render a QuickPick-like selection UI
     * @param {object} task
     */
    function renderQuickPick(task) {
        const container = document.createElement('div');

        // Title
        if (task.title) {
            const title = document.createElement('h2');
            title.textContent = task.title;
            container.appendChild(title);
        }

        // Placeholder / subtitle
        if (task.placeHolder) {
            const subtitle = document.createElement('div');
            subtitle.className = 'task-subtitle';
            subtitle.textContent = task.placeHolder;
            container.appendChild(subtitle);
        }

        // Items
        const list = document.createElement('div');
        list.className = 'quickpick-container';

        for (const item of task.items) {
            const el = document.createElement('div');
            el.className = 'quickpick-item';
            el.tabIndex = 0;

            const label = document.createElement('div');
            label.className = 'quickpick-item-label';
            // Strip codicon references like $(icon-name) for display
            label.textContent = item.label.replace(/\$\([^)]+\)\s*/g, '');
            el.appendChild(label);

            if (item.description) {
                const desc = document.createElement('div');
                desc.className = 'quickpick-item-description';
                desc.textContent = item.description;
                el.appendChild(desc);
            }

            if (item.detail) {
                const detail = document.createElement('div');
                detail.className = 'quickpick-item-detail';
                detail.textContent = item.detail;
                el.appendChild(detail);
            }

            el.addEventListener('click', () => {
                respond(item);
            });

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    respond(item);
                }
            });

            list.appendChild(el);
        }

        container.appendChild(list);

        // Cancel button
        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', cancel);
        buttonRow.appendChild(cancelBtn);
        container.appendChild(buttonRow);

        root.appendChild(container);

        // Focus first item
        const firstItem = list.querySelector('.quickpick-item');
        if (firstItem) {
            firstItem.focus();
        }
    }

    // ================================================================
    // InputBox component
    // ================================================================

    /**
     * Render an InputBox-like text input UI
     * @param {object} task
     */
    function renderInputBox(task) {
        const container = document.createElement('div');
        container.className = 'inputbox-container';

        // Title
        if (task.title) {
            const title = document.createElement('h2');
            title.textContent = task.title;
            container.appendChild(title);
        }

        // Prompt
        if (task.prompt) {
            const prompt = document.createElement('div');
            prompt.className = 'inputbox-prompt';
            prompt.textContent = task.prompt;
            container.appendChild(prompt);
        }

        // Input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inputbox-input';
        input.value = task.value || '';
        input.placeholder = task.placeHolder || '';
        container.appendChild(input);

        // Error message area
        const errorEl = document.createElement('div');
        errorEl.className = 'inputbox-error';
        errorEl.style.display = 'none';
        container.appendChild(errorEl);

        // Validation
        let validationRegex = null;
        if (task.validationRegex) {
            try {
                validationRegex = new RegExp(task.validationRegex);
            } catch (e) {
                // Invalid regex, skip validation
            }
        }

        function validate() {
            const value = input.value;
            if (validationRegex && !validationRegex.test(value)) {
                errorEl.textContent = task.validationMessage || 'Invalid input';
                errorEl.style.display = 'block';
                return false;
            }
            if (!value || value.trim().length === 0) {
                errorEl.textContent = 'Please enter a value';
                errorEl.style.display = 'block';
                return false;
            }
            errorEl.style.display = 'none';
            return true;
        }

        // Buttons
        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', cancel);
        buttonRow.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.className = 'btn-primary';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', () => {
            if (validate()) {
                respond(input.value);
            }
        });
        buttonRow.appendChild(okBtn);

        container.appendChild(buttonRow);

        // Enter key submits
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (validate()) {
                    respond(input.value);
                }
            }
            if (e.key === 'Escape') {
                cancel();
            }
        });

        root.appendChild(container);
        input.focus();
        input.select();
    }

    // ================================================================
    // Verse Selector component
    // ================================================================

    /**
     * Render the interactive verse selector
     * @param {object} task
     */
    function renderVerseSelector(task) {
        const verses = task.verses; // Array of { cellId, displayRef, hasAudio }
        const selectionMode = task.selectionMode; // 'include' or 'exclude'
        const phase = task.phase; // 'Training' or 'Inference'
        const showHideRecorded = task.showHideRecorded;

        // State
        const selectedIds = new Set();
        let filterText = '';
        let hideRecorded = false;

        // Mode-specific labels
        const selectedLabel = selectionMode === 'include' ? '✓ Included' : '✗ Excluded';
        const modeClass = selectionMode === 'include' ? 'verse-selector-include' : 'verse-selector-exclude';

        // Build DOM
        const container = document.createElement('div');
        container.className = 'verse-selector-container ' + modeClass;

        // Title
        const title = document.createElement('h2');
        title.textContent = phase + ' Cell Selection — ' + (selectionMode === 'include' ? 'Include' : 'Exclude') + ' Mode';
        container.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'task-subtitle';
        subtitle.textContent = selectionMode === 'include'
            ? 'Select cells to include in ' + phase.toLowerCase() + '. Only selected cells will be processed.'
            : 'Select cells to exclude from ' + phase.toLowerCase() + '. Selected cells will be skipped.';
        container.appendChild(subtitle);

        // Header section
        const header = document.createElement('div');
        header.className = 'verse-selector-header';

        // Filter input
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'verse-filter-input';
        filterInput.placeholder = 'Filter by reference (e.g., MAT, MAT 1:, JHN 3:16)...';
        header.appendChild(filterInput);

        // Controls row
        const controls = document.createElement('div');
        controls.className = 'verse-selector-controls';

        // Select All in View checkbox (tri-state)
        const selectAllLabel = document.createElement('label');
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(document.createTextNode(' Select All in View'));
        controls.appendChild(selectAllLabel);

        // Deselect All in View button
        const deselectBtn = document.createElement('button');
        deselectBtn.className = 'btn-secondary btn-small';
        deselectBtn.textContent = 'Deselect All in View';
        controls.appendChild(deselectBtn);

        // Hide recorded checkbox (only in inference include mode)
        let hideRecordedCheckbox = null;
        if (showHideRecorded) {
            const hideLabel = document.createElement('label');
            hideRecordedCheckbox = document.createElement('input');
            hideRecordedCheckbox.type = 'checkbox';
            hideLabel.appendChild(hideRecordedCheckbox);
            hideLabel.appendChild(document.createTextNode(' Hide already recorded'));
            controls.appendChild(hideLabel);
        }

        header.appendChild(controls);
        container.appendChild(header);

        // Summary line
        const summary = document.createElement('div');
        summary.className = 'verse-selector-summary';
        container.appendChild(summary);

        // Verse list
        const listContainer = document.createElement('div');
        listContainer.className = 'verse-list';

        // Pre-build all verse elements
        const verseElements = [];
        for (let i = 0; i < verses.length; i++) {
            const verse = verses[i];
            const el = document.createElement('div');
            el.className = 'verse-item';
            el.dataset.index = String(i);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.tabIndex = -1;
            el.appendChild(checkbox);

            const ref = document.createElement('span');
            ref.className = 'verse-item-ref';
            ref.textContent = verse.displayRef;
            el.appendChild(ref);

            if (verse.hasAudio) {
                const badge = document.createElement('span');
                badge.className = 'verse-item-audio-badge';
                badge.textContent = '🎵 recorded';
                el.appendChild(badge);
            }

            const status = document.createElement('span');
            status.className = 'verse-item-status';
            el.appendChild(status);

            // Click handler — toggle selection
            el.addEventListener('click', (e) => {
                if (e.target === checkbox) {
                    // Checkbox click — toggle is already handled by the checkbox
                    if (checkbox.checked) {
                        selectedIds.add(verse.cellId);
                    } else {
                        selectedIds.delete(verse.cellId);
                    }
                } else {
                    // Row click — toggle
                    if (selectedIds.has(verse.cellId)) {
                        selectedIds.delete(verse.cellId);
                    } else {
                        selectedIds.add(verse.cellId);
                    }
                }
                updateDisplay();
            });

            verseElements.push({ el, checkbox, status, verse });
            listContainer.appendChild(el);
        }

        container.appendChild(listContainer);

        // Buttons
        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', cancel);
        buttonRow.appendChild(cancelBtn);

        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn-primary';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', () => {
            respond({ selectedIds: Array.from(selectedIds) });
        });
        buttonRow.appendChild(doneBtn);

        container.appendChild(buttonRow);

        // ---- Event handlers ----

        // Filter input
        filterInput.addEventListener('input', () => {
            filterText = filterInput.value.toLowerCase();
            updateDisplay();
        });

        // Select All in View
        selectAllCheckbox.addEventListener('change', () => {
            if (selectAllCheckbox.checked) {
                // Select all visible
                for (const ve of verseElements) {
                    if (isVisible(ve.verse)) {
                        selectedIds.add(ve.verse.cellId);
                    }
                }
            } else {
                // Deselect all visible
                for (const ve of verseElements) {
                    if (isVisible(ve.verse)) {
                        selectedIds.delete(ve.verse.cellId);
                    }
                }
            }
            updateDisplay();
        });

        // Deselect All in View button
        deselectBtn.addEventListener('click', () => {
            for (const ve of verseElements) {
                if (isVisible(ve.verse)) {
                    selectedIds.delete(ve.verse.cellId);
                }
            }
            updateDisplay();
        });

        // Hide recorded checkbox
        if (hideRecordedCheckbox) {
            hideRecordedCheckbox.addEventListener('change', () => {
                hideRecorded = hideRecordedCheckbox.checked;
                if (hideRecorded) {
                    // Auto-deselect any selected recorded cells
                    for (const ve of verseElements) {
                        if (ve.verse.hasAudio) {
                            selectedIds.delete(ve.verse.cellId);
                        }
                    }
                }
                updateDisplay();
            });
        }

        // ---- Visibility & display logic ----

        /**
         * Check if a verse is visible given current filter and hideRecorded state
         * @param {object} verse
         * @returns {boolean}
         */
        function isVisible(verse) {
            if (hideRecorded && verse.hasAudio) {
                return false;
            }
            if (filterText && !verse.displayRef.toLowerCase().includes(filterText)) {
                return false;
            }
            return true;
        }

        /**
         * Update the display of all verse elements based on current state
         */
        function updateDisplay() {
            let visibleCount = 0;
            let visibleSelectedCount = 0;

            for (const ve of verseElements) {
                const visible = isVisible(ve.verse);
                const selected = selectedIds.has(ve.verse.cellId);

                // Visibility
                if (visible) {
                    ve.el.classList.remove('hidden');
                    visibleCount++;
                    if (selected) { visibleSelectedCount++; }
                } else {
                    ve.el.classList.add('hidden');
                }

                // Selection state
                ve.checkbox.checked = selected;
                if (selected) {
                    ve.el.classList.add('selected');
                    ve.status.textContent = selectedLabel;
                } else {
                    ve.el.classList.remove('selected');
                    ve.status.textContent = '';
                }
            }

            // Update summary
            summary.textContent = visibleCount + ' of ' + verses.length + ' visible \u2502 ' + selectedIds.size + ' selected';

            // Update select-all checkbox state (tri-state)
            if (visibleCount === 0 || visibleSelectedCount === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (visibleSelectedCount === visibleCount) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        root.appendChild(container);
        updateDisplay();
        filterInput.focus();
    }

    // ================================================================
    // Confirmation page component
    // ================================================================

    /**
     * Render the confirmation/review page
     * @param {object} task
     */
    function renderConfirmation(task) {
        const data = task.data;

        const container = document.createElement('div');
        container.className = 'confirmation-container';

        // Title
        const title = document.createElement('h2');
        title.textContent = 'Job Summary';
        container.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'task-subtitle';
        subtitle.textContent = 'Review your job configuration before submitting.';
        container.appendChild(subtitle);

        // Job configuration section
        const configSection = document.createElement('div');
        configSection.className = 'confirmation-section';
        const configTitle = document.createElement('h3');
        configTitle.textContent = 'Configuration';
        configSection.appendChild(configTitle);

        addRow(configSection, 'Mode', formatMode(data.mode));
        addRow(configSection, 'Model', data.modelType);

        if (data.baseCheckpoint) {
            addRow(configSection, 'Base Checkpoint', data.baseCheckpoint);
        } else if (data.mode !== 'inference') {
            addRow(configSection, 'Base Checkpoint', '(none — training from scratch)');
        }

        if (data.epochs) {
            addRow(configSection, 'Epochs', String(data.epochs));
        }

        if (data.voiceReference) {
            addRow(configSection, 'Voice Reference', data.voiceReference);
        }

        container.appendChild(configSection);

        // Audio data section
        if (data.audioStats) {
            const audioSection = document.createElement('div');
            audioSection.className = 'confirmation-section';
            const audioTitle = document.createElement('h3');
            audioTitle.textContent = 'Audio Data';
            audioSection.appendChild(audioTitle);

            addRow(audioSection, 'Total Pairs', String(data.audioStats.totalPairs));
            addRow(audioSection, 'Missing Recordings', String(data.audioStats.missingRecordings));
            addRow(audioSection, 'Coverage', data.audioStats.coveragePercentage.toFixed(1) + '%');

            container.appendChild(audioSection);
        }

        // Selection sections
        if (data.trainingSelection) {
            const trainSection = document.createElement('div');
            trainSection.className = 'confirmation-section';
            const trainTitle = document.createElement('h3');
            trainTitle.textContent = 'Training Selection';
            trainSection.appendChild(trainTitle);

            if (data.trainingSelection.type === 'all') {
                addRow(trainSection, 'Cells', 'All ' + data.trainingSelection.totalCount + ' cells');
            } else {
                const verb = data.trainingSelection.type === 'include' ? 'included' : 'excluded';
                addRow(trainSection, 'Cells', data.trainingSelection.count + ' ' + verb + ' (of ' + data.trainingSelection.totalCount + ' total)');
            }

            container.appendChild(trainSection);
        }

        if (data.inferenceSelection) {
            const inferSection = document.createElement('div');
            inferSection.className = 'confirmation-section';
            const inferTitle = document.createElement('h3');
            inferTitle.textContent = 'Inference Selection';
            inferSection.appendChild(inferTitle);

            if (data.inferenceSelection.type === 'all') {
                addRow(inferSection, 'Cells', 'All ' + data.inferenceSelection.totalCount + ' cells');
            } else {
                const verb = data.inferenceSelection.type === 'include' ? 'included' : 'excluded';
                addRow(inferSection, 'Cells', data.inferenceSelection.count + ' ' + verb + ' (of ' + data.inferenceSelection.totalCount + ' total)');
            }

            if (data.inferenceSelection.overwriteCount && data.inferenceSelection.overwriteCount > 0) {
                addRow(inferSection, '⚠ Overwrite', data.inferenceSelection.overwriteCount + ' cells have existing audio that will be overwritten');
            }

            container.appendChild(inferSection);
        }

        // Warnings
        if (data.warnings && data.warnings.length > 0) {
            for (const warning of data.warnings) {
                const warningEl = document.createElement('div');
                warningEl.className = 'confirmation-warning';
                warningEl.textContent = '⚠ ' + warning;
                container.appendChild(warningEl);
            }
        }

        // Errors
        if (data.errors && data.errors.length > 0) {
            for (const error of data.errors) {
                const errorEl = document.createElement('div');
                errorEl.className = 'confirmation-error';
                errorEl.textContent = '❌ ' + error;
                container.appendChild(errorEl);
            }
        }

        // Buttons
        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';

        const startOverBtn = document.createElement('button');
        startOverBtn.className = 'btn-secondary';
        startOverBtn.textContent = 'Start Over';
        startOverBtn.addEventListener('click', () => {
            respond('start-over');
        });
        buttonRow.appendChild(startOverBtn);

        // Only show submit if no errors
        if (!data.errors || data.errors.length === 0) {
            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn-primary';
            submitBtn.textContent = 'Submit Job';
            submitBtn.addEventListener('click', () => {
                respond('submit');
            });
            buttonRow.appendChild(submitBtn);
        }

        container.appendChild(buttonRow);
        root.appendChild(container);
    }

    // ================================================================
    // Helpers
    // ================================================================

    /**
     * Add a label/value row to a section
     * @param {HTMLElement} parent
     * @param {string} label
     * @param {string} value
     */
    function addRow(parent, label, value) {
        const row = document.createElement('div');
        row.className = 'confirmation-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'confirmation-label';
        labelEl.textContent = label + ':';
        row.appendChild(labelEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'confirmation-value';
        valueEl.textContent = value;
        row.appendChild(valueEl);

        parent.appendChild(row);
    }

    /**
     * Format a mode string for display
     * @param {string} mode
     * @returns {string}
     */
    function formatMode(mode) {
        switch (mode) {
            case 'training': return 'Training';
            case 'inference': return 'Inference';
            case 'training_and_inference': return 'Training and Inference';
            default: return mode;
        }
    }

    // Show loading state initially
    root.innerHTML = '<div class="loading-container">Initializing wizard...</div>';
})();
