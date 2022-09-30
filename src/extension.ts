// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import runDraftDockerfile from './commands/runDraftTool/runDraftDockerfile';
import runDraftGenerateWorkflow from './commands/runDraftTool/runDraftGenerateWorkflow';
import runDraftSetupGH from './commands/runDraftTool/runDraftSetupGH';
import runDraftUpdate from './commands/runDraftTool/runDraftUpdate';
import { Reporter, reporter } from './utils/reporter';
import type { AzureExtensionApiProvider } from '@microsoft/vscode-azext-utils/api';
import { AzureAccountExtensionApi } from './utils/azAccount';
import { Az, AzApi } from './utils/az';
import { API as GitAPI, GitExtension, APIState } from './utils/git';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "aks-draft-extension" is now active!');
    context.subscriptions.push(new Reporter(context));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	const currentWorkspace = vscode.workspace.workspaceFolders![0];

	const azureAccount: AzureAccountExtensionApi = (<AzureExtensionApiProvider>vscode.extensions.getExtension('ms-vscode.azure-account')!.exports).getApi('1.0.0');
	// TODO: pass this into any command function that needs to interact with azure
	const az: AzApi = new Az(azureAccount);

	const git:GitAPI = <GitAPI>vscode.extensions.getExtension('vscode.git')!.exports.getAPI(1);

	let disposableDockerfile = vscode.commands.registerCommand('aks-draft-extension.runDraftDockerfile', async (folder) => {
		if (reporter) {
            reporter.sendTelemetryEvent("command", { command: 'aks-draft-extension.runDraftDockerfile' });
        }
		runDraftDockerfile(context, currentWorkspace.uri.fsPath);
	});

	let disposableSetupGH = vscode.commands.registerCommand('aks-draft-extension.runDraftSetupGH', async (folder) => {
		if (reporter) {
            reporter.sendTelemetryEvent("command", { command: 'aks-draft-extension.runDraftSetupGH' });
        }
		runDraftSetupGH(context, currentWorkspace.uri.fsPath,az,git);
	});

	let disposableGenerateWorkflow = vscode.commands.registerCommand('aks-draft-extension.runDraftGenerateWorkflow', async (folder) => {
		if (reporter) {
            reporter.sendTelemetryEvent("command", { command: 'aks-draft-extension.runDraftGenerateWorkflow' });
        }
		runDraftGenerateWorkflow(context, vscode.Uri.parse(folder).fsPath);
	});

	let disposableUpdate = vscode.commands.registerCommand('aks-draft-extension.runDraftUpdate', async (folder) => {
		if (reporter) {
            reporter.sendTelemetryEvent("command", { command: 'aks-draft-extension.runDraftUpdate' });
        }
		runDraftUpdate(context, vscode.Uri.parse(folder).fsPath);
	});

	context.subscriptions.push(disposableDockerfile);
	context.subscriptions.push(disposableSetupGH);
	context.subscriptions.push(disposableGenerateWorkflow);
	context.subscriptions.push(disposableUpdate);
}

// this method is called when your extension is deactivated
export function deactivate() {}
