import * as vscode from 'vscode';
import { getExtensionPath, longRunning } from '../../utils/host';
import { failed } from '../../utils/errorable';
import { createWebView } from '../../utils/webview';
import { createDraftWebView, downloadDraftBinary, runDraftCommand } from './helper/runDraftHelper';
import { InstallationResponse } from './model/installationResponse';
import { buildSetupGHCommand } from './helper/draftCommandBuilder';
import { reporter } from '../../utils/reporter';

export default async function runDraftSetupGH(
    _context: vscode.ExtensionContext
): Promise<void> {

    const extensionPath = getExtensionPath();
    if (failed(extensionPath)) {
        vscode.window.showErrorMessage(extensionPath.error);
        return undefined;
    }

    // Download Binary first
    const downladResult = await longRunning(`Downloading Draft.`, () => downloadDraftBinary());
    if (!downladResult) {
        return undefined;
    }

    // Create webview with user input required.
    // Abstract - Long running Tasks:
    // Webview to take all inputs necessary
    // Get user input upfront. Then start the installation process.
    const webview = createWebView('AKS Draft Tool', `Draft Setup GitHub OpenID Connect (OIDC)`);
    const installationResponse: InstallationResponse = { name: "test" };
    createDraftWebView('setup_gh', webview, extensionPath.result, installationResponse, true);

    // After the download of the exe or equivalent if first time
    // ---> Ground up work for this is 80 percetn done and checkout the helper methods: in the project.
    // Once the submit for them webview is successfull we handle rest of the installation process for Azure Service Operator.
    webview.onDidReceiveMessage(
        async (message) => {
            if (message.appName && message.subscriptionId && message.resourceGroup && message.ghRepo) {
                const appName = message.appName;
                const subscriptionId = message.subscriptionId;
                const resourceGroup = message.resourceGroup;
                const ghRepo = message.ghRepo;

                const command = buildSetupGHCommand(appName, subscriptionId, resourceGroup, ghRepo);

                const result = await longRunning(`Setting up Github OIDC.`, () => runDraftCommand(command));
                const createResponse: InstallationResponse = { name: "setup_gh", stdout: result[0], stderr: result[1] };
                if (reporter) {
                    const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
                    reporter.sendTelemetryEvent("setupghDraftResult", { setupghDraftResult: `${resultSuccessOrFailure}` });
                }
                createDraftWebView('setup_gh', webview, extensionPath.result, createResponse, false);
            }
            return undefined;
        },
        undefined
    );
    // Step 3: Report it back in the webview with outcome.
}
