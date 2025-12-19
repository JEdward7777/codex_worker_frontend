/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(__webpack_require__(1));
const GitLabService_1 = __webpack_require__(2);
// Global GitLab service instance
let gitLabService;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Codex Worker extension is now active!');
    // Initialize GitLab service
    gitLabService = new GitLabService_1.GitLabService();
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
            }
            else {
                vscode.window.showInformationMessage('○ GPU worker is not yet a member of this project');
            }
            vscode.window.showInformationMessage('✓ GitLab integration test completed successfully!');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`GitLab test failed: ${errorMessage}`);
            console.error('GitLab test error:', error);
        }
    });
    context.subscriptions.push(helloWorldDisposable, testGitLabDisposable);
}
// This method is called when your extension is deactivated
function deactivate() { }


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GitLabService = void 0;
const vscode = __importStar(__webpack_require__(1));
const fs = __importStar(__webpack_require__(3));
const path = __importStar(__webpack_require__(4));
class GitLabService {
    static DEFAULT_GITLAB_URL = 'https://git.genesisrnd.com';
    static DEFAULT_WORKER_USER_ID = 551;
    static DEVELOPER_ACCESS_LEVEL = 30;
    frontierAPI = null;
    /**
     * Initialize connection to Frontier Authentication plugin
     */
    async initialize() {
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
    async getToken() {
        if (!this.frontierAPI) {
            await this.initialize();
        }
        return this.frontierAPI.gitLabService.getToken();
    }
    /**
     * Get GitLab base URL
     */
    getBaseUrl() {
        if (!this.frontierAPI) {
            throw new Error('GitLab service not initialized');
        }
        return this.frontierAPI.gitLabService.getBaseUrl();
    }
    /**
     * Get worker user ID from settings or use default
     */
    getWorkerUserId() {
        const config = vscode.workspace.getConfiguration('codex-worker');
        return config.get('workerUserId', GitLabService.DEFAULT_WORKER_USER_ID);
    }
    /**
     * Parse GitLab project ID from .git/config file
     * Supports both HTTPS and SSH URLs
     */
    async getProjectIdFromWorkspace() {
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
        let projectPath = null;
        if (remoteUrl.startsWith('https://')) {
            const httpsMatch = remoteUrl.match(/https:\/\/[^\/]+\/(.+?)(?:\.git)?$/);
            if (httpsMatch) {
                projectPath = httpsMatch[1];
            }
        }
        else if (remoteUrl.startsWith('git@')) {
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
    async shareProjectWithWorker() {
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
    async unshareProjectFromWorker() {
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
    async isWorkerMember() {
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
    async verifyConnection() {
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
        }
        catch (error) {
            console.error('GitLab connection verification failed:', error);
            return false;
        }
    }
}
exports.GitLabService = GitLabService;


/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("path");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map