// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
   IActionContext,
   callWithTelemetryAndErrorHandling,
   createAzExtOutputChannel,
   registerUIExtensionVariables,
   registerCommand
} from '@microsoft/vscode-azext-utils';
import {Context} from './commands/runDraftTool/model/context';
import {runDraftDockerfile} from './commands/runDraftTool/runDraftDockerfile';
import {runDraftDeployment} from './commands/runDraftTool/runDraftDeployment';

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
   const outputChannel = createAzExtOutputChannel('AKS DevX Tools', '');
   context.subscriptions.push(outputChannel);
   registerUIExtensionVariables({
      context,
      outputChannel
   });
}

function registerCommands(extensionContext: vscode.ExtensionContext): void {
   registerCommand(
      'aks-draft-extension.runDraftDockerfile',
      (actionContext: IActionContext, folder) => {
         const context: Context = {actionContext, extensionContext};
         let target = undefined;
         try {
            target = vscode.Uri.parse(folder, true);
         } catch {}
         return runDraftDockerfile(context, target);
      }
   );

   registerCommand(
      'aks-draft-extension.runDraftDeployment',
      (actionContext: IActionContext, folder) => {
         const context: Context = {actionContext, extensionContext};
         let target = undefined;
         try {
            target = vscode.Uri.parse(folder, true);
         } catch {}
         return runDraftDeployment(context, target);
      }
   );
}

// this method is called when your extension is deactivated
export function deactivate() {}
