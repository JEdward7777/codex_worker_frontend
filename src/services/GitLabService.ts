import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FrontierAPI {
    gitLabService: {
        getToken(): Promise<string>;
        getBaseUrl(): string;
    };
}

interface GitLabProjectMember {
    id: number;
    username: string;
    access_level: number;
}

export class GitLabService {
    private static readonly DEFAULT_GITLAB_URL = 'https://git.genesisrnd.com';
    private static readonly DEFAULT_WORKER_USER_ID = 551;
    private static readonly DEVELOPER_ACCESS_LEVEL = 30;

    private frontierAPI: FrontierAPI | null = null;

    /**
     * Initialize connection to Frontier Authentication plugin
     */
    async initialize(): Promise<void> {
        const frontierExt = vscode.extensions.getExtension('frontier-rnd.frontier-authentication');
        
        if (!frontierExt) {
            throw new Error('Frontier Authentication plugin is not installed. Please install it to use GPU jobs.');
        }

        this.frontierAPI = await frontierExt.activate();
        
        if (!this.frontierAPI) {
            throw new Error('Failed to activate Frontier Authentication plugin.');
        }
    }

    /**
     * Get GitLab authentication token
     */
    private async getToken(): Promise<string> {
        if (!this.frontierAPI) {
            await this.initialize();
        }
        return this.frontierAPI!.gitLabService.getToken();
    }

    /**
     * Get GitLab base URL
     */
    private getBaseUrl(): string {
        if (!this.frontierAPI) {
            throw new Error('GitLab service not initialized');
        }
        return this.frontierAPI.gitLabService.getBaseUrl();
    }

    /**
     * Get worker user ID from settings or use default
     */
    private getWorkerUserId(): number {
        const config = vscode.workspace.getConfiguration('codex-worker');
        return config.get<number>('workerUserId', GitLabService.DEFAULT_WORKER_USER_ID);
    }

    /**
     * Parse GitLab project ID from .git/config file
     * Supports both HTTPS and SSH URLs
     */
    async getProjectIdFromWorkspace(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const gitConfigPath = path.join(workspaceRoot, '.git', 'config');

        if (!fs.existsSync(gitConfigPath)) {
            return null;
        }

        const gitConfig = fs.readFileSync(gitConfigPath, 'utf-8');
        
        // Look for remote "origin" URL
        const remoteMatch = gitConfig.match(/\[remote "origin"\]\s+url = (.+)/);
        if (!remoteMatch) {
            return null;
        }

        const remoteUrl = remoteMatch[1].trim();
        
        // Parse project path from URL
        // HTTPS: https://git.genesisrnd.com/username/project-name.git
        // SSH: git@git.genesisrnd.com:username/project-name.git
        let projectPath: string | null = null;

        if (remoteUrl.startsWith('https://')) {
            const httpsMatch = remoteUrl.match(/https:\/\/[^\/]+\/(.+?)(?:\.git)?$/);
            if (httpsMatch) {
                projectPath = httpsMatch[1];
            }
        } else if (remoteUrl.startsWith('git@')) {
            const sshMatch = remoteUrl.match(/git@[^:]+:(.+?)(?:\.git)?$/);
            if (sshMatch) {
                projectPath = sshMatch[1];
            }
        }

        if (!projectPath) {
            return null;
        }

        // URL-encode the project path for GitLab API
        return encodeURIComponent(projectPath);
    }

    /**
     * Share the current workspace project with the GPU worker
     */
    async shareProjectWithWorker(): Promise<void> {
        const projectId = await this.getProjectIdFromWorkspace();
        
        if (!projectId) {
            throw new Error('No GitLab remote found. Please push your project to GitLab before creating GPU jobs.');
        }

        const token = await this.getToken();
        const baseUrl = this.getBaseUrl();
        const workerId = this.getWorkerUserId();

        const url = `${baseUrl}/api/v4/projects/${projectId}/members`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: workerId,
                access_level: GitLabService.DEVELOPER_ACCESS_LEVEL
            })
        });

        if (!response.ok) {
            // If user is already a member, that's fine
            if (response.status === 409) {
                console.log('Worker is already a member of this project');
                return;
            }
            
            const errorText = await response.text();
            throw new Error(`Failed to share project with worker: ${response.status} ${response.statusText}\n${errorText}`);
        }

        console.log('Successfully shared project with GPU worker');
    }

    /**
     * Unshare the current workspace project from the GPU worker
     */
    async unshareProjectFromWorker(): Promise<void> {
        const projectId = await this.getProjectIdFromWorkspace();
        
        if (!projectId) {
            // If there's no GitLab remote, nothing to unshare
            console.log('No GitLab remote found, nothing to unshare');
            return;
        }

        const token = await this.getToken();
        const baseUrl = this.getBaseUrl();
        const workerId = this.getWorkerUserId();

        const url = `${baseUrl}/api/v4/projects/${projectId}/members/${workerId}`;
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // If user is not a member, that's fine
            if (response.status === 404) {
                console.log('Worker is not a member of this project');
                return;
            }
            
            const errorText = await response.text();
            throw new Error(`Failed to unshare project from worker: ${response.status} ${response.statusText}\n${errorText}`);
        }

        console.log('Successfully unshared project from GPU worker');
    }

    /**
     * Check if the worker is currently a member of the project
     */
    async isWorkerMember(): Promise<boolean> {
        const projectId = await this.getProjectIdFromWorkspace();
        
        if (!projectId) {
            return false;
        }

        const token = await this.getToken();
        const baseUrl = this.getBaseUrl();
        const workerId = this.getWorkerUserId();

        const url = `${baseUrl}/api/v4/projects/${projectId}/members/${workerId}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        return response.ok;
    }

    /**
     * Verify GitLab connectivity and authentication
     */
    async verifyConnection(): Promise<boolean> {
        try {
            const token = await this.getToken();
            const baseUrl = this.getBaseUrl();

            const url = `${baseUrl}/api/v4/user`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            return response.ok;
        } catch (error) {
            console.error('GitLab connection verification failed:', error);
            return false;
        }
    }
}