import {Context} from './model/context';
import * as vscode from 'vscode';
import {State, StateApi} from '../../utils/state';
import {longRunning} from '../../utils/host';
import {downloadDraftBinary, runDraftCommand} from './helper/runDraftHelper';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {DraftFormat, draftFormats} from './model/format';
import {ValidateRfc1123} from '../../utils/validation';
import {PromptPort} from './helper/commonPrompts';

const title = 'Draft a Kubernetes Deployment and Service';
const ignoreFocusOut = true;

interface PromptContext {
   outputFolder: vscode.Uri;
   applicationName: string;
   format: DraftFormat;
   namespace: string;
   image: string;
   port: string;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftDeployment(
   {actionContext, extensionContext}: Context,
   outputFolder: vscode.Uri
) {
   const state: StateApi = State.construct(extensionContext);

   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   const wizardContext: WizardContext = {
      ...actionContext,
      port: state.getPort(),
      outputFolder
   };
   const promptSteps: IPromptStep[] = [
      new PromptOutputFolder(),
      new PromptFormat(),
      new PromptApplicationName(),
      new PromptPort()
   ];
   const executeSteps: IExecuteStep[] = [];
   const wizard = new AzureWizard(wizardContext, {
      title,
      promptSteps,
      executeSteps
   });
   await wizard.prompt();
   await wizard.execute();
}

class PromptOutputFolder extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const outputFolder = (
         await wizardContext.ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            stepName: 'Output Folder',
            openLabel: 'Choose Output Folder',
            defaultUri: wizardContext.outputFolder
         })
      )[0];

      if (!vscode.workspace.getWorkspaceFolder(outputFolder)) {
         throw Error(
            'Chosen Output Folder is not in current workspace. Please choose a folder in the workspace'
         );
      }

      wizardContext.outputFolder = outputFolder;
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptFormat extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const formatToItem = (format: DraftFormat) => ({label: format});

      const formatOptions: vscode.QuickPickItem[] =
         draftFormats.map(formatToItem);
      const formatPick = await wizardContext.ui.showQuickPick(formatOptions, {
         ignoreFocusOut,
         stepName: 'Format',
         placeHolder: 'Format'
      });

      const format = draftFormats.find(
         (format) => formatToItem(format).label === formatPick.label
      );
      if (format === undefined) {
         throw Error('Format was not recognized'); // this should never happen
      }

      wizardContext.format = format;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptApplicationName extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.applicationName = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'Application name (e.g. myapp-backend)',
         stepName: 'Application name',
         validateInput: ValidateRfc1123
      });
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}
