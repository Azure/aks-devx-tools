import * as vscode from 'vscode';
import {getExtensionPath, longRunning} from '../../utils/host';
import {failed} from '../../utils/errorable';
import {createWebView} from '../../utils/webview';
import {
   createDraftWebView,
   downloadDraftBinary,
   runDraftCommand
} from './helper/runDraftHelper';
import {InstallationResponse} from './model/installationResponse';
import {buildUpdateCommand} from './helper/draftCommandBuilder';
import {Context} from './model/context';

export default async function runDraftUpdate(
   context: Context,
   destination: string
): Promise<void> {
   const extensionPath = getExtensionPath();
   if (failed(extensionPath)) {
      vscode.window.showErrorMessage(extensionPath.error);
      return undefined;
   }

   // Download Binary first
   const downladResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   );
   if (!downladResult) {
      return undefined;
   }

   // Create webview with user input required.
   // Abstract - Long running Tasks:
   // Webview to take all inputs necessary
   // Get user input upfront. Then start the installation process.
   const webview = createWebView(
      'AKS Draft Tool',
      `Draft Enable Web Application Routing`
   );
   const installationResponse: InstallationResponse = {name: 'test'};
   createDraftWebView(
      'update',
      webview,
      extensionPath.result,
      installationResponse,
      true
   );

   // After the download of the exe or equivalent if first time
   // ---> Ground up work for this is 80 percetn done and checkout the helper methods: in the project.
   // Once the submit for them webview is successfull we handle rest of the installation process for Azure Service Operator.
   webview.onDidReceiveMessage(async (message) => {
      if (message.host && message.certificate) {
         const host = message.host;
         const certificate = message.certificate;

         const command = buildUpdateCommand(destination, host, certificate);

         const [success, err] = await runDraftCommand(command);
         const createResponse: InstallationResponse = {
            name: 'update',
            stdout: success,
            stderr: err
         };
         const isSuccess = err?.length === 0 && success?.length !== 0;
         context.telemetry.properties.result = isSuccess
            ? 'Succeeded'
            : 'Failed';

         createDraftWebView(
            'update',
            webview,
            extensionPath.result,
            createResponse,
            false
         );
      }
      return undefined;
   }, undefined);
   // Step 3: Report it back in the webview with outcome.
}
