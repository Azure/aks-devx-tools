import {failed} from '../../utils/errorable';
import {getExtensionPath, longRunning} from '../../utils/host';
import {Context} from './model/context';
import * as vscode from 'vscode';
import {downloadDraftBinary} from './helper/runDraftHelper';

export async function runDraftDockerfile(
   context: Context,
   destination: string
) {
   const extensionPath = getExtensionPath();
   if (failed(extensionPath)) {
      vscode.window.showErrorMessage(extensionPath.error);
      return undefined;
   }

   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   // context.ui.showInputBox({prompt: 'hello world!'});
}
