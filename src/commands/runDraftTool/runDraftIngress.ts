import {CompletedSteps} from './model/guidedExperience';
import * as vscode from 'vscode';
import {Context} from './model/context';
import {StateApi, State} from '../../utils/state';
import {longRunning} from '../../utils/host';
import {downloadDraftBinary} from './helper/runDraftHelper';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';

interface PromptContext {
   outputFolder: vscode.Uri;
   tlsCertUri: string;
   useOsm: boolean;
   ingressHost: string;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

const title = 'Draft a Kubernetes Ingress with Web App Routing';

export async function runDraftIngress(
   {actionContext, extensionContext}: Context,
   outputFolder: vscode.Uri | undefined,
   completedSteps: CompletedSteps
) {
   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   const state: StateApi = State.construct(extensionContext);
   const deploymentPath = state.getDeploymentPath();
   if (completedSteps.draftDeployment && deploymentPath !== undefined) {
      outputFolder = vscode.Uri.file(deploymentPath);
   }

   const wizardContext: WizardContext = {
      ...actionContext,
      outputFolder: outputFolder
   };
   const promptSteps: IPromptStep[] = [new PromptOutputFolder(completedSteps)];
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
   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const outputFolder = (
         await wizardContext.ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            stepName: 'Output Folder',
            openLabel: 'Choose Output Folder',
            title: 'Choose Output Folder',
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
      return !(
         wizardContext.outputFolder !== undefined &&
         this.completedSteps.draftDeployment
      );
   }
}
