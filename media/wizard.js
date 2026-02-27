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
            case 'job-detail':
                renderJobDetail(task);
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
            // Only require non-empty when a validation regex is set
            // (optional fields like name/description have no regex)
            if (validationRegex && (!value || value.trim().length === 0)) {
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

    /** Currently playing audio element (shared across all play buttons) */
    let currentAudio = null;
    let currentPlayButton = null;

    /**
     * Stop any currently playing audio
     */
    function stopCurrentAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        if (currentPlayButton) {
            currentPlayButton.textContent = '▶';
            currentPlayButton.classList.remove('playing');
            currentPlayButton = null;
        }
    }

    /**
     * Handle audio URI response from extension
     */
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'audio-uri' && message.uri) {
            stopCurrentAudio();

            const audio = new Audio(message.uri);
            currentAudio = audio;

            // Find the play button that requested this
            const btn = document.querySelector('[data-request-id="' + message.requestId + '"]');
            if (btn) {
                currentPlayButton = btn;
                btn.textContent = '⏹';
                btn.classList.add('playing');
            }

            audio.addEventListener('ended', () => {
                stopCurrentAudio();
            });

            audio.addEventListener('error', () => {
                stopCurrentAudio();
            });

            audio.play().catch(() => {
                stopCurrentAudio();
            });
        }
    });

    /**
     * Render the interactive verse selector
     * Supports three modes:
     *   - 'include': multi-select, include mode (green)
     *   - 'exclude': multi-select, exclude mode (red)
     *   - 'single-audio': single-select for reference audio picking
     * @param {object} task
     */
    function renderVerseSelector(task) {
        const verses = task.verses; // Array of { cellId, displayRef, hasAudio, hasLocalAudio?, audioFilePath? }
        const selectionMode = task.selectionMode; // 'include', 'exclude', or 'single-audio'
        const phase = task.phase; // 'Training', 'Inference', or 'Reference Audio'
        const showHideRecorded = task.showHideRecorded;
        const showPlayButton = task.showPlayButton || false;
        const allowSkip = task.allowSkip || false;
        const isSingleAudio = selectionMode === 'single-audio';

        // State
        const selectedIds = new Set();
        let filterText = '';
        let hideRecorded = false;

        // Mode-specific labels
        let selectedLabel = '';
        let modeClass = '';
        if (isSingleAudio) {
            selectedLabel = '';
            modeClass = 'verse-selector-single-audio';
        } else if (selectionMode === 'include') {
            selectedLabel = '✓ Included';
            modeClass = 'verse-selector-include';
        } else {
            selectedLabel = '✗ Excluded';
            modeClass = 'verse-selector-exclude';
        }

        // Build DOM
        const container = document.createElement('div');
        container.className = 'verse-selector-container ' + modeClass;

        // Title
        const title = document.createElement('h2');
        if (isSingleAudio) {
            title.textContent = 'Select Reference Audio';
        } else {
            title.textContent = phase + ' Cell Selection — ' + (selectionMode === 'include' ? 'Include' : 'Exclude') + ' Mode';
        }
        container.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'task-subtitle';
        if (isSingleAudio) {
            subtitle.textContent = 'Select a recorded verse to use as the voice reference for inference. Click a row to select it.';
        } else if (selectionMode === 'include') {
            subtitle.textContent = 'Select cells to include in ' + phase.toLowerCase() + '. Only selected cells will be processed.';
        } else {
            subtitle.textContent = 'Select cells to exclude from ' + phase.toLowerCase() + '. Selected cells will be skipped.';
        }
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

        // Controls row (hidden in single-audio mode via CSS)
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

        // Audio request counter for unique IDs
        let audioRequestCounter = 0;

        // Pre-build all verse elements
        const verseElements = [];
        for (let i = 0; i < verses.length; i++) {
            const verse = verses[i];
            const el = document.createElement('div');
            el.className = 'verse-item';
            el.dataset.index = String(i);

            // Checkbox (hidden in single-audio mode via CSS)
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

            // Play button (shown when showPlayButton is true and verse has local audio)
            if (showPlayButton && verse.hasLocalAudio && verse.audioFilePath) {
                const playBtn = document.createElement('button');
                playBtn.className = 'verse-play-button';
                playBtn.textContent = '▶';
                playBtn.title = 'Preview audio';

                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Don't trigger row selection

                    // If this button is already playing, stop it
                    if (currentPlayButton === playBtn) {
                        stopCurrentAudio();
                        return;
                    }

                    // Request audio URI from extension
                    const requestId = 'audio_' + (++audioRequestCounter);
                    playBtn.dataset.requestId = requestId;

                    vscode.postMessage({
                        type: 'get-audio-uri',
                        filePath: verse.audioFilePath,
                        requestId: requestId,
                    });
                });

                el.appendChild(playBtn);
            }

            // Status label (hidden in single-audio mode via CSS)
            const status = document.createElement('span');
            status.className = 'verse-item-status';
            el.appendChild(status);

            if (isSingleAudio) {
                // Single-audio mode: click selects and responds immediately
                el.addEventListener('click', (e) => {
                    // Don't select when clicking play button
                    if (e.target && e.target.classList && e.target.classList.contains('verse-play-button')) {
                        return;
                    }

                    // Stop any playing audio
                    stopCurrentAudio();

                    // Convert files/ path to pointers/ path for GPU worker
                    let pointerPath = verse.audioFilePath || '';
                    if (pointerPath) {
                        // The audioFilePath is an absolute path to files/ folder
                        // We need to return a relative path using pointers/ folder
                        // e.g., ".project/attachments/pointers/JHN/audio-xxx.webm"
                        const filesMarker = '.project/attachments/files/';
                        const idx = pointerPath.indexOf(filesMarker);
                        if (idx !== -1) {
                            pointerPath = '.project/attachments/pointers/' + pointerPath.substring(idx + filesMarker.length);
                        }
                    }

                    respond({
                        selectedIds: [verse.cellId],
                        selectedAudioPath: pointerPath,
                    });
                });
            } else {
                // Multi-select mode: click toggles selection
                el.addEventListener('click', (e) => {
                    // Don't toggle when clicking play button
                    if (e.target && e.target.classList && e.target.classList.contains('verse-play-button')) {
                        return;
                    }

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
            }

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
        cancelBtn.addEventListener('click', () => {
            stopCurrentAudio();
            cancel();
        });
        buttonRow.appendChild(cancelBtn);

        // Skip button (for optional selections like reference audio)
        if (allowSkip) {
            const skipBtn = document.createElement('button');
            skipBtn.className = 'btn-secondary';
            skipBtn.textContent = 'Skip';
            skipBtn.title = 'Continue without selecting';
            skipBtn.addEventListener('click', () => {
                stopCurrentAudio();
                respond({ selectedIds: [] });
            });
            buttonRow.appendChild(skipBtn);
        }

        // Done button (only in multi-select mode)
        if (!isSingleAudio) {
            const doneBtn = document.createElement('button');
            doneBtn.className = 'btn-primary';
            doneBtn.textContent = 'Done';
            doneBtn.addEventListener('click', () => {
                stopCurrentAudio();
                respond({ selectedIds: Array.from(selectedIds) });
            });
            buttonRow.appendChild(doneBtn);
        }

        container.appendChild(buttonRow);

        // ---- Event handlers ----

        // Filter input
        filterInput.addEventListener('input', () => {
            filterText = filterInput.value.toLowerCase();
            updateDisplay();
        });

        // Select All in View (only relevant in multi-select mode)
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

                // Selection state (only relevant in multi-select mode)
                if (!isSingleAudio) {
                    ve.checkbox.checked = selected;
                    if (selected) {
                        ve.el.classList.add('selected');
                        ve.status.textContent = selectedLabel;
                    } else {
                        ve.el.classList.remove('selected');
                        ve.status.textContent = '';
                    }
                }
            }

            // Update summary
            if (isSingleAudio) {
                summary.textContent = visibleCount + ' of ' + verses.length + ' verses shown';
            } else {
                summary.textContent = visibleCount + ' of ' + verses.length + ' visible \u2502 ' + selectedIds.size + ' selected';
            }

            // Update select-all checkbox state (tri-state) — only in multi-select mode
            if (!isSingleAudio) {
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

        // Job name and description (if provided)
        if (data.name) {
            const nameSection = document.createElement('div');
            nameSection.className = 'confirmation-section';
            const nameTitle = document.createElement('h3');
            nameTitle.textContent = 'Job Identity';
            nameSection.appendChild(nameTitle);

            addRow(nameSection, 'Name', data.name);
            if (data.description) {
                addRow(nameSection, 'Description', data.description);
            }

            container.appendChild(nameSection);
        }

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
    // Job Detail component
    // ================================================================

    /**
     * Render the job detail view with information and action buttons.
     * @param {object} task
     */
    function renderJobDetail(task) {
        const data = task.data;

        const container = document.createElement('div');
        container.className = 'job-detail-container';

        // Header with status badge
        const header = document.createElement('div');
        header.className = 'job-detail-header';

        const title = document.createElement('h2');
        title.textContent = 'Job Details';
        header.appendChild(title);

        const badge = document.createElement('span');
        badge.className = 'job-detail-badge job-detail-badge-' + data.state;
        badge.textContent = formatState(data.state, data.canceled);
        header.appendChild(badge);

        container.appendChild(header);

        // Job name (if available, show prominently)
        if (data.name) {
            const nameRow = document.createElement('div');
            nameRow.className = 'job-detail-name';
            nameRow.textContent = data.name;
            container.appendChild(nameRow);
        }

        // Job ID
        const jobIdRow = document.createElement('div');
        jobIdRow.className = 'job-detail-id';
        jobIdRow.textContent = data.jobId;
        container.appendChild(jobIdRow);

        // Description (if available)
        if (data.description) {
            const descRow = document.createElement('div');
            descRow.className = 'job-detail-description';
            descRow.textContent = data.description;
            container.appendChild(descRow);
        }

        // Configuration section
        const configSection = document.createElement('div');
        configSection.className = 'confirmation-section';
        const configTitle = document.createElement('h3');
        configTitle.textContent = 'Configuration';
        configSection.appendChild(configTitle);

        addRow(configSection, 'Mode', formatMode(data.mode));
        addRow(configSection, 'Model', data.modelType);
        addRow(configSection, 'Job Type', data.jobType);

        if (data.baseCheckpoint) {
            addRow(configSection, 'Base Checkpoint', data.baseCheckpoint);
        }

        if (data.epochs) {
            let epochsText = String(data.epochs);
            if (data.epochsCompleted !== undefined && data.epochsCompleted !== null) {
                epochsText = data.epochsCompleted + ' / ' + data.epochs;
            }
            addRow(configSection, 'Epochs', epochsText);
        }

        if (data.voiceReference) {
            addRow(configSection, 'Voice Reference', data.voiceReference);
        }

        container.appendChild(configSection);

        // Status section
        const statusSection = document.createElement('div');
        statusSection.className = 'confirmation-section';
        const statusTitle = document.createElement('h3');
        statusTitle.textContent = 'Status';
        statusSection.appendChild(statusTitle);

        addRow(statusSection, 'State', formatState(data.state, data.canceled));

        if (data.workerId) {
            addRow(statusSection, 'Worker', data.workerId);
        }

        if (data.submittedAt) {
            addRow(statusSection, 'Submitted', formatTimestamp(data.submittedAt));
        }

        if (data.responseTimestamp) {
            const label = (data.state === 'completed' || data.state === 'failed' || data.state === 'canceled')
                ? 'Completed' : 'Last Update';
            addRow(statusSection, label, formatTimestamp(data.responseTimestamp));
        }

        if (data.errorMessage) {
            addRow(statusSection, 'Error', data.errorMessage);
        }

        container.appendChild(statusSection);

        // Verse selection section (if applicable)
        if (data.trainingVerseCount !== undefined && data.trainingVerseCount !== null) {
            const trainSection = document.createElement('div');
            trainSection.className = 'confirmation-section';
            const trainTitle = document.createElement('h3');
            trainTitle.textContent = 'Training Selection';
            trainSection.appendChild(trainTitle);
            addRow(trainSection, 'Filtered Verses', String(data.trainingVerseCount));
            container.appendChild(trainSection);
        }

        if (data.inferenceVerseCount !== undefined && data.inferenceVerseCount !== null) {
            const inferSection = document.createElement('div');
            inferSection.className = 'confirmation-section';
            const inferTitle = document.createElement('h3');
            inferTitle.textContent = 'Inference Selection';
            inferSection.appendChild(inferTitle);
            addRow(inferSection, 'Filtered Verses', String(data.inferenceVerseCount));
            container.appendChild(inferSection);
        }

        // Action buttons
        if (data.availableActions && data.availableActions.length > 0) {
            const actionsSection = document.createElement('div');
            actionsSection.className = 'job-detail-actions';
            const actionsTitle = document.createElement('h3');
            actionsTitle.textContent = 'Actions';
            actionsSection.appendChild(actionsTitle);

            const buttonRow = document.createElement('div');
            buttonRow.className = 'job-detail-button-row';

            for (const action of data.availableActions) {
                const btn = document.createElement('button');
                btn.className = getActionButtonClass(action);
                btn.textContent = getActionLabel(action);
                btn.title = getActionTooltip(action);
                btn.addEventListener('click', () => {
                    respond(action);
                });
                buttonRow.appendChild(btn);
            }

            actionsSection.appendChild(buttonRow);
            container.appendChild(actionsSection);
        }

        // Training Metrics Graph (at the bottom, before close button)
        if (data.trainingMetrics && data.trainingMetrics.epochs.length > 0 && data.trainingMetrics.columns.length > 0) {
            const metricsSection = renderTrainingMetrics(data.trainingMetrics);
            container.appendChild(metricsSection);
        }

        // Close button (always available)
        const footerRow = document.createElement('div');
        footerRow.className = 'button-row';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-secondary';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', cancel);
        footerRow.appendChild(closeBtn);
        container.appendChild(footerRow);

        root.appendChild(container);
    }

    /**
     * Format a job state for display
     * @param {string} state
     * @param {boolean} canceled
     * @returns {string}
     */
    function formatState(state, canceled) {
        if (canceled && state !== 'canceled') {
            return getStateEmoji(state) + ' ' + capitalizeFirst(state) + ' (canceling)';
        }
        return getStateEmoji(state) + ' ' + capitalizeFirst(state);
    }

    /**
     * Get emoji for a job state
     * @param {string} state
     * @returns {string}
     */
    function getStateEmoji(state) {
        switch (state) {
            case 'pending': return '⏳';
            case 'running': return '▶️';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'canceled': return '🚫';
            default: return '❓';
        }
    }

    /**
     * Capitalize the first letter of a string
     * @param {string} str
     * @returns {string}
     */
    function capitalizeFirst(str) {
        if (!str) { return str; }
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Format an ISO timestamp for display
     * @param {string} iso
     * @returns {string}
     */
    function formatTimestamp(iso) {
        try {
            const date = new Date(iso);
            if (isNaN(date.getTime())) { return iso; }
            return date.toLocaleString();
        } catch {
            return iso;
        }
    }

    /**
     * Get the CSS class for an action button
     * @param {string} action
     * @returns {string}
     */
    function getActionButtonClass(action) {
        switch (action) {
            case 'cancel-job': return 'btn-warning';
            case 'delete-job': return 'btn-danger';
            case 'further-train': return 'btn-primary';
            case 'run-inference': return 'btn-primary';
            case 'clone-job': return 'btn-secondary';
            case 'view-logs': return 'btn-secondary';
            case 'open-job-folder': return 'btn-secondary';
            default: return 'btn-secondary';
        }
    }

    /**
     * Get the display label for an action
     * @param {string} action
     * @returns {string}
     */
    function getActionLabel(action) {
        switch (action) {
            case 'cancel-job': return '⏹ Cancel Job';
            case 'delete-job': return '🗑 Delete Job';
            case 'further-train': return '🔄 Further Train';
            case 'run-inference': return '🔊 Run Inference';
            case 'clone-job': return '📋 Clone Job';
            case 'view-logs': return '📄 View Logs';
            case 'open-job-folder': return '📂 Open Folder';
            default: return action;
        }
    }

    /**
     * Get the tooltip for an action button
     * @param {string} action
     * @returns {string}
     */
    function getActionTooltip(action) {
        switch (action) {
            case 'cancel-job': return 'Cancel this running or pending job';
            case 'delete-job': return 'Delete this job and its model files permanently';
            case 'further-train': return 'Create a new training job using this model as a base';
            case 'run-inference': return 'Create a new inference job using this model';
            case 'clone-job': return 'Re-submit a new job with the same parameters';
            case 'view-logs': return 'Open the job response file in the editor';
            case 'open-job-folder': return 'Reveal the job folder in the file explorer';
            default: return '';
        }
    }

    // ================================================================
    // Training Metrics Graph
    // ================================================================

    /** Color palette for metric lines — works in both dark and light themes */
    const METRIC_COLORS = {
        'train_total_loss': '#4fc3f7',
        'val_total_loss': '#ff8a65',
        'train_diff_loss': '#81c784',
        'train_dur_loss': '#ba68c8',
        'train_prior_loss': '#fff176',
        'val_diff_loss': '#e57373',
        'val_dur_loss': '#4db6ac',
        'val_prior_loss': '#a1887f',
    };

    /** Fallback colors for unknown columns */
    const FALLBACK_COLORS = [
        '#4fc3f7', '#ff8a65', '#81c784', '#ba68c8',
        '#fff176', '#e57373', '#4db6ac', '#a1887f',
        '#90caf9', '#ffab91', '#a5d6a7', '#ce93d8',
    ];

    /** Primary columns that get special treatment */
    const PRIMARY_COLUMNS = ['train_total_loss', 'val_total_loss'];

    /**
     * Render the training metrics section with SVG line graph.
     * @param {object} metrics - TrainingMetricsData object
     * @returns {HTMLElement} The metrics section element
     */
    function renderTrainingMetrics(metrics) {
        const section = document.createElement('div');
        section.className = 'training-metrics-section';

        const title = document.createElement('h3');
        title.textContent = 'Training Metrics';
        section.appendChild(title);

        // Determine which columns to show initially
        const hasPrimary = metrics.hasPrimaryColumns;
        let visibleColumns;
        if (hasPrimary) {
            visibleColumns = PRIMARY_COLUMNS.slice();
        } else {
            visibleColumns = metrics.columns.slice();
        }

        // Graph container
        const graphContainer = document.createElement('div');
        graphContainer.className = 'training-metrics-graph-container';
        section.appendChild(graphContainer);

        // Render the initial graph
        renderSvgGraph(graphContainer, metrics, visibleColumns);

        // Legend
        const legend = document.createElement('div');
        legend.className = 'training-metrics-legend';
        section.appendChild(legend);
        updateLegend(legend, visibleColumns);

        // Checkbox to show detailed metrics (only when primary columns exist)
        if (hasPrimary && metrics.columns.length > 2) {
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'training-metrics-checkbox-container';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'show-detailed-metrics';

            const label = document.createElement('label');
            label.htmlFor = 'show-detailed-metrics';
            label.textContent = ' Show detailed metrics';

            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(label);
            section.appendChild(checkboxContainer);

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    visibleColumns = metrics.columns.slice();
                } else {
                    visibleColumns = PRIMARY_COLUMNS.slice();
                }
                graphContainer.innerHTML = '';
                renderSvgGraph(graphContainer, metrics, visibleColumns);
                updateLegend(legend, visibleColumns);
            });
        }

        // Explanatory text (only when primary columns exist)
        if (hasPrimary) {
            const explanation = document.createElement('div');
            explanation.className = 'training-metrics-explanation';
            explanation.innerHTML =
                '<p><strong>Training Loss</strong>: How well the model fits the training data. ' +
                'Lower values indicate the model is learning the patterns in your audio data.</p>' +
                '<p><strong>Validation Loss</strong>: How well the model generalizes to unseen data. ' +
                'Lower values are better. If validation loss rises while training loss continues to fall, ' +
                'the model may be overfitting — memorizing the training data rather than learning ' +
                'generalizable patterns.</p>';
            section.appendChild(explanation);
        }

        return section;
    }

    /**
     * Update the legend to show currently visible columns.
     * @param {HTMLElement} legendEl
     * @param {string[]} visibleColumns
     */
    function updateLegend(legendEl, visibleColumns) {
        legendEl.innerHTML = '';
        for (const col of visibleColumns) {
            const item = document.createElement('span');
            item.className = 'training-metrics-legend-item';

            const swatch = document.createElement('span');
            swatch.className = 'training-metrics-legend-swatch';
            swatch.style.backgroundColor = getMetricColor(col);
            item.appendChild(swatch);

            const label = document.createElement('span');
            label.textContent = formatMetricName(col);
            item.appendChild(label);

            legendEl.appendChild(item);
        }
    }

    /**
     * Get the color for a metric column.
     * @param {string} column
     * @returns {string}
     */
    function getMetricColor(column) {
        if (METRIC_COLORS[column]) {
            return METRIC_COLORS[column];
        }
        // Fallback: hash the column name to pick a color
        let hash = 0;
        for (let i = 0; i < column.length; i++) {
            hash = ((hash << 5) - hash) + column.charCodeAt(i);
            hash |= 0;
        }
        return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
    }

    /**
     * Format a metric column name for display.
     * e.g., "train_total_loss" → "Train Total Loss"
     * @param {string} name
     * @returns {string}
     */
    function formatMetricName(name) {
        return name
            .split('_')
            .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1); })
            .join(' ');
    }

    /**
     * Render an SVG line chart into the given container.
     * @param {HTMLElement} container
     * @param {object} metrics - TrainingMetricsData
     * @param {string[]} visibleColumns - Which columns to plot
     */
    function renderSvgGraph(container, metrics, visibleColumns) {
        // Chart dimensions
        const margin = { top: 20, right: 20, bottom: 50, left: 70 };
        const chartHeight = 400;
        // We'll use viewBox for responsive width; the actual width is set via CSS
        const chartWidth = 800;
        const plotWidth = chartWidth - margin.left - margin.right;
        const plotHeight = chartHeight - margin.top - margin.bottom;

        // Calculate data range
        const epochs = metrics.epochs;
        const xMin = Math.min.apply(null, epochs);
        const xMax = Math.max.apply(null, epochs);

        let yMin = Infinity;
        let yMax = -Infinity;
        for (const col of visibleColumns) {
            const data = metrics.series[col];
            if (!data) { continue; }
            for (let i = 0; i < data.length; i++) {
                if (!isNaN(data[i])) {
                    if (data[i] < yMin) { yMin = data[i]; }
                    if (data[i] > yMax) { yMax = data[i]; }
                }
            }
        }

        // Add 5% padding to Y range
        if (yMin === Infinity || yMax === -Infinity) {
            yMin = 0;
            yMax = 1;
        }
        const yRange = yMax - yMin;
        const yPadding = yRange * 0.05 || 0.1;
        yMin = yMin - yPadding;
        yMax = yMax + yPadding;

        // Scale functions
        function scaleX(val) {
            if (xMax === xMin) { return margin.left + plotWidth / 2; }
            return margin.left + ((val - xMin) / (xMax - xMin)) * plotWidth;
        }
        function scaleY(val) {
            if (yMax === yMin) { return margin.top + plotHeight / 2; }
            return margin.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
        }

        // Create SVG
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + chartWidth + ' ' + chartHeight);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.classList.add('training-metrics-svg');

        // Background
        const bg = document.createElementNS(svgNS, 'rect');
        bg.setAttribute('x', '0');
        bg.setAttribute('y', '0');
        bg.setAttribute('width', String(chartWidth));
        bg.setAttribute('height', String(chartHeight));
        bg.classList.add('training-metrics-bg');
        svg.appendChild(bg);

        // Grid lines (Y-axis)
        const yTickCount = 6;
        for (let i = 0; i <= yTickCount; i++) {
            const yVal = yMin + (yMax - yMin) * (i / yTickCount);
            const y = scaleY(yVal);

            // Grid line
            const gridLine = document.createElementNS(svgNS, 'line');
            gridLine.setAttribute('x1', String(margin.left));
            gridLine.setAttribute('y1', String(y));
            gridLine.setAttribute('x2', String(chartWidth - margin.right));
            gridLine.setAttribute('y2', String(y));
            gridLine.classList.add('training-metrics-grid');
            svg.appendChild(gridLine);

            // Y-axis label
            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', String(margin.left - 10));
            label.setAttribute('y', String(y + 4));
            label.setAttribute('text-anchor', 'end');
            label.classList.add('training-metrics-axis-label');
            label.textContent = yVal.toFixed(2);
            svg.appendChild(label);
        }

        // X-axis labels
        const xTickCount = Math.min(epochs.length, 10);
        const xStep = Math.max(1, Math.floor(epochs.length / xTickCount));
        for (let i = 0; i < epochs.length; i += xStep) {
            const x = scaleX(epochs[i]);

            // Tick mark
            const tick = document.createElementNS(svgNS, 'line');
            tick.setAttribute('x1', String(x));
            tick.setAttribute('y1', String(margin.top + plotHeight));
            tick.setAttribute('x2', String(x));
            tick.setAttribute('y2', String(margin.top + plotHeight + 6));
            tick.classList.add('training-metrics-tick');
            svg.appendChild(tick);

            // X-axis label
            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', String(x));
            label.setAttribute('y', String(margin.top + plotHeight + 22));
            label.setAttribute('text-anchor', 'middle');
            label.classList.add('training-metrics-axis-label');
            label.textContent = String(Math.round(epochs[i]));
            svg.appendChild(label);
        }

        // Axis lines
        // Y-axis
        const yAxis = document.createElementNS(svgNS, 'line');
        yAxis.setAttribute('x1', String(margin.left));
        yAxis.setAttribute('y1', String(margin.top));
        yAxis.setAttribute('x2', String(margin.left));
        yAxis.setAttribute('y2', String(margin.top + plotHeight));
        yAxis.classList.add('training-metrics-axis');
        svg.appendChild(yAxis);

        // X-axis
        const xAxis = document.createElementNS(svgNS, 'line');
        xAxis.setAttribute('x1', String(margin.left));
        xAxis.setAttribute('y1', String(margin.top + plotHeight));
        xAxis.setAttribute('x2', String(chartWidth - margin.right));
        xAxis.setAttribute('y2', String(margin.top + plotHeight));
        xAxis.classList.add('training-metrics-axis');
        svg.appendChild(xAxis);

        // Axis titles
        // X-axis title
        const xTitle = document.createElementNS(svgNS, 'text');
        xTitle.setAttribute('x', String(margin.left + plotWidth / 2));
        xTitle.setAttribute('y', String(chartHeight - 5));
        xTitle.setAttribute('text-anchor', 'middle');
        xTitle.classList.add('training-metrics-axis-title');
        xTitle.textContent = 'Epoch';
        svg.appendChild(xTitle);

        // Y-axis title (rotated)
        const yTitle = document.createElementNS(svgNS, 'text');
        yTitle.setAttribute('x', String(-(margin.top + plotHeight / 2)));
        yTitle.setAttribute('y', '15');
        yTitle.setAttribute('text-anchor', 'middle');
        yTitle.setAttribute('transform', 'rotate(-90)');
        yTitle.classList.add('training-metrics-axis-title');
        yTitle.textContent = 'Loss';
        svg.appendChild(yTitle);

        // Plot lines
        for (const col of visibleColumns) {
            const data = metrics.series[col];
            if (!data) { continue; }

            const color = getMetricColor(col);
            const isPrimary = PRIMARY_COLUMNS.indexOf(col) !== -1;
            const strokeWidth = isPrimary ? '2.5' : '1.5';

            // Build path data, skipping NaN values
            let pathData = '';
            let started = false;
            for (let i = 0; i < epochs.length && i < data.length; i++) {
                if (isNaN(data[i])) {
                    started = false;
                    continue;
                }
                const x = scaleX(epochs[i]);
                const y = scaleY(data[i]);
                if (!started) {
                    pathData += 'M ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
                    started = true;
                } else {
                    pathData += 'L ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
                }
            }

            if (pathData) {
                const path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', pathData);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', strokeWidth);
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-linecap', 'round');
                svg.appendChild(path);
            }
        }

        // Best validation loss marker (★) — shown when val_total_loss is visible
        if (visibleColumns.indexOf('val_total_loss') !== -1) {
            const valData = metrics.series['val_total_loss'];
            if (valData) {
                let bestIdx = -1;
                let bestVal = Infinity;
                for (let i = 0; i < epochs.length && i < valData.length; i++) {
                    if (!isNaN(valData[i]) && valData[i] < bestVal) {
                        bestVal = valData[i];
                        bestIdx = i;
                    }
                }
                if (bestIdx >= 0) {
                    const starX = scaleX(epochs[bestIdx]);
                    const starY = scaleY(bestVal);
                    // Use gold color for the star so it stands out from the orange val_total_loss line
                    const starColor = '#ffd700';

                    // Star marker
                    const star = document.createElementNS(svgNS, 'text');
                    star.setAttribute('x', String(starX));
                    star.setAttribute('y', String(starY + 2));
                    star.setAttribute('text-anchor', 'middle');
                    star.setAttribute('dominant-baseline', 'middle');
                    star.setAttribute('font-size', '18');
                    star.setAttribute('fill', starColor);
                    star.classList.add('training-metrics-best-star');
                    star.textContent = '★';
                    svg.appendChild(star);

                    // Annotation label: "Best: X.XXXX (epoch N)"
                    const annotationText = 'Best: ' + bestVal.toFixed(4) + ' (epoch ' + Math.round(epochs[bestIdx]) + ')';
                    const annotation = document.createElementNS(svgNS, 'text');
                    // Position label to the right of the star, or left if near the right edge
                    const labelOnRight = starX < (margin.left + plotWidth * 0.7);
                    annotation.setAttribute('x', String(labelOnRight ? starX + 14 : starX - 14));
                    annotation.setAttribute('y', String(starY - 8));
                    annotation.setAttribute('text-anchor', labelOnRight ? 'start' : 'end');
                    annotation.setAttribute('font-size', '11');
                    annotation.setAttribute('fill', starColor);
                    annotation.classList.add('training-metrics-best-label');
                    annotation.textContent = annotationText;
                    svg.appendChild(annotation);
                }
            }
        }

        // Tooltip overlay — invisible rect to capture mouse events
        const overlay = document.createElementNS(svgNS, 'rect');
        overlay.setAttribute('x', String(margin.left));
        overlay.setAttribute('y', String(margin.top));
        overlay.setAttribute('width', String(plotWidth));
        overlay.setAttribute('height', String(plotHeight));
        overlay.setAttribute('fill', 'transparent');
        overlay.style.cursor = 'crosshair';
        svg.appendChild(overlay);

        // Tooltip vertical line
        const tooltipLine = document.createElementNS(svgNS, 'line');
        tooltipLine.setAttribute('y1', String(margin.top));
        tooltipLine.setAttribute('y2', String(margin.top + plotHeight));
        tooltipLine.classList.add('training-metrics-tooltip-line');
        tooltipLine.style.display = 'none';
        svg.appendChild(tooltipLine);

        // Tooltip dots group
        const dotsGroup = document.createElementNS(svgNS, 'g');
        dotsGroup.style.display = 'none';
        svg.appendChild(dotsGroup);

        container.appendChild(svg);

        // Tooltip HTML element (positioned absolutely over the SVG)
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'training-metrics-tooltip';
        tooltipEl.style.display = 'none';
        container.appendChild(tooltipEl);

        // Mouse event handlers for tooltip
        overlay.addEventListener('mousemove', function (e) {
            const svgRect = svg.getBoundingClientRect();
            const svgWidth = svgRect.width;
            const svgHeight = svgRect.height;

            // Convert mouse position to SVG coordinate space
            const mouseX = (e.clientX - svgRect.left) / svgWidth * chartWidth;

            // Find nearest epoch
            let nearestIdx = 0;
            let nearestDist = Infinity;
            for (let i = 0; i < epochs.length; i++) {
                const x = scaleX(epochs[i]);
                const dist = Math.abs(x - mouseX);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }

            const epochX = scaleX(epochs[nearestIdx]);

            // Update vertical line
            tooltipLine.setAttribute('x1', String(epochX));
            tooltipLine.setAttribute('x2', String(epochX));
            tooltipLine.style.display = '';

            // Update dots
            dotsGroup.innerHTML = '';
            dotsGroup.style.display = '';

            // Build tooltip content
            let html = '<strong>Epoch ' + Math.round(epochs[nearestIdx]) + '</strong>';
            for (const col of visibleColumns) {
                const data = metrics.series[col];
                if (!data || nearestIdx >= data.length || isNaN(data[nearestIdx])) { continue; }
                const val = data[nearestIdx];
                const color = getMetricColor(col);

                html += '<div class="training-metrics-tooltip-row">' +
                    '<span class="training-metrics-tooltip-swatch" style="background:' + color + '"></span>' +
                    '<span>' + formatMetricName(col) + ': ' + val.toFixed(4) + '</span></div>';

                // Add dot on the line
                const dot = document.createElementNS(svgNS, 'circle');
                dot.setAttribute('cx', String(epochX));
                dot.setAttribute('cy', String(scaleY(val)));
                dot.setAttribute('r', '4');
                dot.setAttribute('fill', color);
                dot.setAttribute('stroke', 'var(--vscode-editor-background, #1e1e1e)');
                dot.setAttribute('stroke-width', '1.5');
                dotsGroup.appendChild(dot);
            }

            tooltipEl.innerHTML = html;
            tooltipEl.style.display = 'block';

            // Position tooltip near the mouse but within bounds
            const tooltipX = (e.clientX - svgRect.left) + 15;
            const tooltipY = (e.clientY - svgRect.top) - 10;
            tooltipEl.style.left = tooltipX + 'px';
            tooltipEl.style.top = tooltipY + 'px';

            // Keep tooltip within container bounds
            const containerRect = container.getBoundingClientRect();
            const tooltipRect = tooltipEl.getBoundingClientRect();
            if (tooltipRect.right > containerRect.right) {
                tooltipEl.style.left = (tooltipX - tooltipRect.width - 30) + 'px';
            }
            if (tooltipRect.bottom > containerRect.bottom) {
                tooltipEl.style.top = (tooltipY - tooltipRect.height) + 'px';
            }
        });

        overlay.addEventListener('mouseleave', function () {
            tooltipLine.style.display = 'none';
            dotsGroup.style.display = 'none';
            tooltipEl.style.display = 'none';
        });
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
