// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitLabService } from './services/GitLabService';
import { ManifestService } from './services/ManifestService';
import { AudioDiscoveryService } from './services/AudioDiscoveryService';
import { PreflightService } from './services/PreflightService';
import { JobTreeDataProvider, JobTreeItem } from './ui/JobTreeDataProvider';
import { NewJobWizard, WizardPresets } from './ui/NewJobWizard';
import { JobDetailPanel } from './ui/JobDetailPanel';
import { JobCreationParams } from './types/ui';
import { TTSModelType, JobMode } from './types/manifest';

// Global service instances
let gitLabService: GitLabService;
let manifestService: ManifestService;
let audioDiscoveryService: AudioDiscoveryService;
let preflightService: PreflightService;
let jobTreeDataProvider: JobTreeDataProvider;

// Track active panels to manage concurrency.
// - wizardRunning: true when a multi-step wizard is open (cannot be interrupted)
// - activeDetailPanel: reference to the current detail panel's WebviewUI so it
//   can be disposed (which resolves its pending promise to undefined) when the
//   user clicks a different job
let wizardRunning = false;
let activeDetailPanel: JobDetailPanel | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Codex Worker extension is now active!');

	// Initialize services
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {
		vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
		return;
	}

	gitLabService = new GitLabService();
	manifestService = new ManifestService();
	audioDiscoveryService = new AudioDiscoveryService(workspaceRoot);
	preflightService = new PreflightService(
		audioDiscoveryService,
		manifestService,
		gitLabService
	);

	// Initialize tree data provider
	jobTreeDataProvider = new JobTreeDataProvider(workspaceRoot, manifestService);

	// Register tree view
	const treeView = vscode.window.createTreeView('codex-worker-jobs', {
		treeDataProvider: jobTreeDataProvider,
		showCollapseAll: false
	});

	// Register hello world command (for testing)
	const helloWorldDisposable = vscode.commands.registerCommand('codex-worker.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codex-worker!');
	});

	// Register GitLab connection test command
	const testGitLabDisposable = vscode.commands.registerCommand('codex-worker.testGitLabConnection', async () => {
		try {
			vscode.window.showInformationMessage('Testing GitLab connection...');

			// Initialize the service
			await gitLabService.initialize();
			vscode.window.showInformationMessage('✓ Frontier Authentication connected');

			// Verify GitLab connection
			const isConnected = await gitLabService.verifyConnection();
			if (!isConnected) {
				vscode.window.showErrorMessage('✗ GitLab connection failed. Please check your authentication.');
				return;
			}
			vscode.window.showInformationMessage('✓ GitLab API connection verified');

			// Get project ID from workspace
			const projectId = await gitLabService.getProjectIdFromWorkspace();
			if (!projectId) {
				vscode.window.showWarningMessage('⚠ No GitLab remote found in workspace. Please push your project to GitLab first.');
				return;
			}
			vscode.window.showInformationMessage(`✓ Found GitLab project: ${decodeURIComponent(projectId)}`);

			// Check if worker is already a member
			const isWorkerMember = await gitLabService.isWorkerMember();
			if (isWorkerMember) {
				vscode.window.showInformationMessage('✓ GPU worker is already a member of this project');
			} else {
				vscode.window.showInformationMessage('○ GPU worker is not yet a member of this project');
			}

			vscode.window.showInformationMessage('✓ GitLab integration test completed successfully!');

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`GitLab test failed: ${errorMessage}`);
			console.error('GitLab test error:', error);
		}
	});

	// Register manifest generation test command
	const testManifestDisposable = vscode.commands.registerCommand('codex-worker.testManifestGeneration', async () => {
		try {
			vscode.window.showInformationMessage('Testing manifest generation...');

			// Check if manifest already exists
			const exists = await manifestService.manifestExists();
			if (exists) {
				const overwrite = await vscode.window.showWarningMessage(
					'Manifest file already exists. Overwrite with test data?',
					'Yes', 'No'
				);
				if (overwrite !== 'Yes') {
					vscode.window.showInformationMessage('Manifest generation cancelled');
					return;
				}
			}

			// Generate a test job ID
			const jobId = manifestService.generateJobId();
			vscode.window.showInformationMessage(`✓ Generated job ID: ${jobId}`);

			// Create a sample job
			const sampleJob = {
				job_id: jobId,
				job_type: 'tts' as const,
				mode: 'training_and_inference' as const,
				submitted_at: new Date().toISOString(),
				model: {
					type: 'StableTTS' as const
				},
				epochs: 100,
				training: {
					include_verses: ['GEN.1.1', 'GEN.1.2', 'GEN.1.3', 'GEN.1.4', 'GEN.1.5']
				},
				inference: {
					include_verses: ['GEN.1.1', 'GEN.1.2', 'GEN.1.3']
				}
			};

			// Add job to manifest
			await manifestService.addJob(sampleJob);
			vscode.window.showInformationMessage('✓ Created manifest with sample job');

			// Read back the manifest to verify
			const manifest = await manifestService.readManifest();
			if (manifest && manifest.jobs.length > 0) {
				vscode.window.showInformationMessage(
					`✓ Manifest verified: version ${manifest.version}, ${manifest.jobs.length} job(s)`
				);
			}

			// Get jobs with state
			const jobsWithState = await manifestService.getJobsWithState();
			const firstJob = jobsWithState[0];
			vscode.window.showInformationMessage(
				`✓ Job state: ${firstJob.state} (${firstJob.mode} mode, ${firstJob.epochs || 'N/A'} epochs)`
			);

			vscode.window.showInformationMessage('✓ Manifest generation test completed successfully!');

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Manifest test failed: ${errorMessage}`);
			console.error('Manifest test error:', error);
		}
	});

	// Register audio discovery test command
	const testAudioDiscoveryDisposable = vscode.commands.registerCommand('codex-worker.testAudioDiscovery', async () => {
		try {
			vscode.window.showInformationMessage('Testing audio discovery...');

			// Discover all audio
			const summary = await audioDiscoveryService.discoverAudio({
				validateFiles: true
			});

			// Show summary
			vscode.window.showInformationMessage(
				`✓ Found ${summary.totalVerses} verses in ${summary.books.length} book(s)`
			);
			vscode.window.showInformationMessage(
				`✓ Audio coverage: ${summary.versesWithAudio}/${summary.totalVerses} verses (${Math.round(summary.versesWithAudio / summary.totalVerses * 100)}%)`
			);

			// Show per-book breakdown
			for (const book of summary.books) {
				const totalVerses = summary.versesByBook.get(book) || 0;
				const audioVerses = summary.audioByBook.get(book) || 0;
				const percentage = totalVerses > 0 ? Math.round(audioVerses / totalVerses * 100) : 0;
				vscode.window.showInformationMessage(
					`  ${book}: ${audioVerses}/${totalVerses} verses (${percentage}%)`
				);
			}

			// Validate audio sufficiency
			const validation = audioDiscoveryService.validateAudioSufficiency(summary, 10);
			if (validation.sufficient) {
				vscode.window.showInformationMessage(`✓ ${validation.message}`);
			} else {
				vscode.window.showWarningMessage(`⚠ ${validation.message}`);
			}

			// Show missing audio if any
			if (summary.versesWithoutAudio > 0) {
				const showMissing = await vscode.window.showInformationMessage(
					`${summary.versesWithoutAudio} cells are missing audio. Show details?`,
					'Yes', 'No'
				);

				if (showMissing === 'Yes') {
					const missingCells = summary.verses
						.filter(v => !v.hasAudio)
						.slice(0, 10)  // Show first 10
						.map(v => v.verseRef || v.cellId)  // Show Bible ref if available, otherwise cell ID
						.join(', ');

					vscode.window.showInformationMessage(
						`Missing audio (first 10): ${missingCells}${summary.versesWithoutAudio > 10 ? '...' : ''}`
					);
				}
			}

			vscode.window.showInformationMessage('✓ Audio discovery test completed successfully!');

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Audio discovery test failed: ${errorMessage}`);
			console.error('Audio discovery test error:', error);
		}
	});

	// Register refresh jobs command
	const refreshJobsDisposable = vscode.commands.registerCommand('codex-worker.refreshJobs', async () => {
		await jobTreeDataProvider.refresh();
		vscode.window.showInformationMessage('Job list refreshed');
	});

	/**
	 * Create a job from wizard parameters: builds the manifest entry,
	 * adds it, shares the project, and refreshes the tree.
	 * Returns the new job ID, or null if creation failed.
	 */
	async function createJobFromParams(jobParams: JobCreationParams): Promise<string | null> {
		const jobId = manifestService.generateJobId();

		// Build separate training and inference configs
		const needsTraining = jobParams.mode === 'training' || jobParams.mode === 'training_and_inference';
		const needsInference = jobParams.mode === 'inference' || jobParams.mode === 'training_and_inference';

		const hasTrainingFilters = !!(jobParams.trainingIncludeVerses || jobParams.trainingExcludeVerses);
		const trainingConfig = (needsTraining && hasTrainingFilters) ? {
			include_verses: jobParams.trainingIncludeVerses,
			exclude_verses: jobParams.trainingExcludeVerses
		} : undefined;

		const hasInferenceFilters = !!(jobParams.inferenceIncludeVerses || jobParams.inferenceExcludeVerses);
		const inferenceConfig = (needsInference && hasInferenceFilters) ? {
			include_verses: jobParams.inferenceIncludeVerses,
			exclude_verses: jobParams.inferenceExcludeVerses
		} : undefined;

		const job = {
			job_id: jobId,
			job_type: 'tts' as const,
			mode: jobParams.mode,
			submitted_at: new Date().toISOString(),
			model: {
				type: jobParams.modelType as 'StableTTS',
				base_checkpoint: jobParams.baseCheckpoint
			},
			epochs: jobParams.epochs,
			training: trainingConfig,
			inference: inferenceConfig,
			voice_reference: jobParams.voiceReference,
			canceled: false
		};

		// Add job to manifest
		await manifestService.addJob(job);

		// Share project with worker
		await gitLabService.shareProjectWithWorker();

		// Refresh the tree view
		await jobTreeDataProvider.refresh();

		return jobId;
	}

	/**
	 * Run the new job wizard (optionally with presets) and create the job.
	 * Returns the new job ID, or null if the user canceled.
	 */
	async function runWizardAndCreateJob(presets?: WizardPresets): Promise<string | null> {
		const wizard = new NewJobWizard(
			audioDiscoveryService,
			manifestService,
			context.extensionUri
		);

		const jobParams = await wizard.run(presets);
		if (!jobParams) {
			return null;
		}

		return createJobFromParams(jobParams);
	}

	// Register new job command
	const newJobDisposable = vscode.commands.registerCommand('codex-worker.newJob', async () => {
		// If a detail panel is open, close it (resolves its promise to undefined)
		if (activeDetailPanel) {
			activeDetailPanel.dispose();
			activeDetailPanel = null;
		}

		// Prevent opening a wizard while another wizard is running
		if (wizardRunning) {
			vscode.window.showInformationMessage('A job wizard is already open.');
			return;
		}

		wizardRunning = true;
		try {
			const jobId = await runWizardAndCreateJob();
			if (jobId) {
				vscode.window.showInformationMessage(`✓ Job ${jobId} created successfully!`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to create job: ${errorMessage}`);
			console.error('New job error:', error);
		} finally {
			wizardRunning = false;
		}
	});

	// Register view job detail command (triggered by clicking a job in the tree)
	const viewJobDetailDisposable = vscode.commands.registerCommand('codex-worker.viewJobDetail', async (jobItem: JobTreeItem) => {
		if (!jobItem || !jobItem.job) {
			return;
		}

		// If a wizard is running, don't interrupt it
		if (wizardRunning) {
			vscode.window.showInformationMessage('Please close the job wizard first.');
			return;
		}

		// If a detail panel is already open, dispose it so it resolves to undefined
		// and the previous viewJobDetail call exits cleanly. This allows clicking
		// a different job to replace the current detail panel.
		if (activeDetailPanel) {
			activeDetailPanel.dispose();
			activeDetailPanel = null;
			// Small delay to let the previous async handler finish its finally block
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		const panel = new JobDetailPanel(
			manifestService,
			context.extensionUri
		);

		// Track this panel so it can be disposed if the user clicks another job
		activeDetailPanel = panel;

		try {
			const result = await panel.run(jobItem.job);

			// If this panel was replaced by another (disposed externally),
			// result will be null and we should just exit quietly
			if (!result && activeDetailPanel !== panel) {
				return;
			}

			// Clear the active panel reference
			if (activeDetailPanel === panel) {
				activeDetailPanel = null;
			}

			// Refresh tree after any action (cancel, delete, etc.)
			await jobTreeDataProvider.refresh();

			// Handle follow-up actions that need to launch the wizard
			if (result?.action === 'further-train') {
				wizardRunning = true;
				try {
					const presets: WizardPresets = {
						mode: 'training',
						modelType: result.job.model.type as TTSModelType,
						baseCheckpoint: result.checkpointPath ?? null,
						contextLabel: `Further training from ${result.job.job_id}`,
					};

					const jobId = await runWizardAndCreateJob(presets);
					if (jobId) {
						vscode.window.showInformationMessage(`✓ Job ${jobId} created successfully!`);
					}
				} finally {
					wizardRunning = false;
				}
			} else if (result?.action === 'run-inference') {
				wizardRunning = true;
				try {
					const presets: WizardPresets = {
						mode: 'inference',
						modelType: result.job.model.type as TTSModelType,
						baseCheckpoint: result.checkpointPath ?? null,
						contextLabel: `Inference using model from ${result.job.job_id}`,
					};

					const jobId = await runWizardAndCreateJob(presets);
					if (jobId) {
						vscode.window.showInformationMessage(`✓ Job ${jobId} created successfully!`);
					}
				} finally {
					wizardRunning = false;
				}
			} else if (result?.action === 'clone-job') {
				wizardRunning = true;
				try {
					// Clone: pre-fill with the same mode, model type, checkpoint, and voice reference
					const job = result.job;
					const presets: WizardPresets = {
						mode: job.mode as JobMode,
						modelType: job.model.type as TTSModelType,
						baseCheckpoint: job.model.base_checkpoint ?? null,
						voiceReference: job.voice_reference ?? null,
						contextLabel: `Clone of ${job.job_id}`,
					};

					const jobId = await runWizardAndCreateJob(presets);
					if (jobId) {
						vscode.window.showInformationMessage(`✓ Job ${jobId} created successfully!`);
					}
				} finally {
					wizardRunning = false;
				}
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Job detail error: ${errorMessage}`);
			console.error('View job detail error:', error);
		} finally {
			// Clean up if this panel is still the active one
			if (activeDetailPanel === panel) {
				activeDetailPanel = null;
			}
		}
	});

	// Register cancel job command
	const cancelJobDisposable = vscode.commands.registerCommand('codex-worker.cancelJob', async (jobItem: JobTreeItem) => {
		try {
			if (!jobItem || !jobItem.job) {
				vscode.window.showErrorMessage('No job selected');
				return;
			}

			const jobId = jobItem.job.job_id;

			const confirm = await vscode.window.showWarningMessage(
				`Remove job ${jobId} from the manifest?`,
				{ modal: true },
				'Yes', 'No'
			);

			if (confirm !== 'Yes') {
				return;
			}

			// Remove the job from the manifest
			await manifestService.removeJob(jobId);

			// Refresh the tree view
			await jobTreeDataProvider.refresh();

			vscode.window.showInformationMessage(`✓ Job ${jobId} removed from manifest`);

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to remove job: ${errorMessage}`);
			console.error('Remove job error:', error);
		}
	});

	context.subscriptions.push(
		helloWorldDisposable,
		testGitLabDisposable,
		testManifestDisposable,
		testAudioDiscoveryDisposable,
		jobTreeDataProvider,
		treeView,
		refreshJobsDisposable,
		newJobDisposable,
		viewJobDetailDisposable,
		cancelJobDisposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Codex Worker extension is deactivating...');

	// Null out global service references to allow garbage collection
	gitLabService = undefined!;
	manifestService = undefined!;
	audioDiscoveryService = undefined!;
	preflightService = undefined!;
	jobTreeDataProvider = undefined!;

	console.log('Codex Worker extension deactivated.');
}
