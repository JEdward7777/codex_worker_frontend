// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitLabService } from './services/GitLabService';

// Global GitLab service instance
let gitLabService: GitLabService;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Codex Worker extension is now active!');

	// Initialize GitLab service
	gitLabService = new GitLabService();

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

	context.subscriptions.push(helloWorldDisposable, testGitLabDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
