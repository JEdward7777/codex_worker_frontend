// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitLabService } from './services/GitLabService';
import { ManifestService } from './services/ManifestService';

// Global service instances
let gitLabService: GitLabService;
let manifestService: ManifestService;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Codex Worker extension is now active!');

	// Initialize services
	gitLabService = new GitLabService();
	manifestService = new ManifestService();

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
				model: {
					type: 'StableTTS' as const
				},
				epochs: 100,
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

	context.subscriptions.push(helloWorldDisposable, testGitLabDisposable, testManifestDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
