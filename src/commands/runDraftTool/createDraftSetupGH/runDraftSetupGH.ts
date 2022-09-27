import * as vscode from 'vscode';
import { getExtensionPath, longRunning } from '../../../utils/host';
import { failed } from '../../../utils/errorable';
import { multiStepInput } from './runDraftSetupGHMultiStepInput';
import { downloadDraftBinary } from '../helper/runDraftHelper';

export default async function runDraftCreateCmdPalette(
    _context: vscode.ExtensionContext,
    destination: string
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

    // Create command palette wizard
    // 1) Get multi step data.
    // 2) Transition between steps.
    // 3) Accumulate data for action.
    multiStepInput(_context, destination);
}
