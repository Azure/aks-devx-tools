// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import runDraftCreate from './commands/runDraftTool/runDraftCreate';
import runDraftGenerateWorkflow from './commands/runDraftTool/runDraftGenerateWorkflow';
import runDraftSetupGH from './commands/runDraftTool/runDraftSetupGH';
import runDraftUpdate from './commands/runDraftTool/runDraftUpdate';
import {
   IActionContext,
   callWithTelemetryAndErrorHandling,
   createAzExtOutputChannel,
   registerUIExtensionVariables,
   registerCommand
} from '@microsoft/vscode-azext-utils';
import {Context} from './commands/runDraftTool/model/context';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
   initializeExtensionVariables(context);

   await callWithTelemetryAndErrorHandling(
      'aks-devx-tools.activate',
      async (activateContext: IActionContext) => {
         activateContext.errorHandling.rethrow = true;
         activateContext.telemetry.properties.isActivationEvent = 'true';

         registerCommands(context);
      }
   );
}

function initializeExtensionVariables(context: vscode.ExtensionContext): void {
   const outputChannel = createAzExtOutputChannel(
      'AKS DevX Tools',
      'aks-devx-tools'
   );
   context.subscriptions.push(outputChannel);
   registerUIExtensionVariables({context, outputChannel});
}

function registerCommands(extensionContext: vscode.ExtensionContext): void {
   registerCommand(
      'aks-draft-extension.runDraftCreate',
      (actionContext: IActionContext, folder) => {
         const context: Context = {...actionContext, ...extensionContext};
         runDraftCreate(context, vscode.Uri.parse(folder).fsPath);
      }
   );

   registerCommand(
      'aks-draft-extension.runDraftSetupGH',
      (actionContext: IActionContext) => {
         const context: Context = {...actionContext, ...extensionContext};
         runDraftSetupGH(context);
      }
   );

   registerCommand(
      'aks-draft-extension.runDraftGenerateWorkflow',
      (actionContext: IActionContext, folder) => {
         const context: Context = {...actionContext, ...extensionContext};
         runDraftGenerateWorkflow(context, vscode.Uri.parse(folder).fsPath);
      }
   );

   registerCommand(
      'aks-draft-extension.runDraftUpdate',
      (actionContext: IActionContext, folder) => {
         const context: Context = {...actionContext, ...extensionContext};
         runDraftUpdate(context, vscode.Uri.parse(folder).fsPath);
      }
   );
}

// this method is called when your extension is deactivated
export function deactivate() {}
