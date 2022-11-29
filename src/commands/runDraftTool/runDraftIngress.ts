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
import {
   Az,
   AzApi,
   getAzureAccount,
   KeyVaultItem,
   ResourceGroupItem,
   SubscriptionItem
} from '../../utils/az';
import {getAysncResult} from '../../utils/errorable';
import {sort} from '../../utils/sort';
import {ignoreFocusOut} from './helper/commonPrompts';
import {getAsyncOptions, removeRecentlyUsed} from '../../utils/quickPick';

interface PromptContext {
   outputFolder: vscode.Uri;
   tlsCertUri: string;
   useOsm: boolean;
   ingressHost: string;
   kvSubscription: SubscriptionItem;
   kvResourceGroup: ResourceGroupItem;
   kv: KeyVaultItem;
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

   const az: AzApi = new Az(getAzureAccount());

   const state: StateApi = State.construct(extensionContext);
   const deploymentPath = state.getDeploymentPath();
   if (completedSteps.draftDeployment && deploymentPath !== undefined) {
      outputFolder = vscode.Uri.file(deploymentPath);
   }

   const wizardContext: WizardContext = {
      ...actionContext,
      outputFolder: outputFolder
   };
   const promptSteps: IPromptStep[] = [
      new PromptOutputFolder(completedSteps),
      new PromptKvSubscription(az),
      new PromptKvResourceGroup(az),
      new PromptKv(az)
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

class PromptKvSubscription extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const subs = getAysncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: 'Key Vault Subscription',
            placeHolder: 'Key Vault Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      wizardContext.kvSubscription = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptKvResourceGroup extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.kvSubscription === undefined) {
         throw Error('Key Vault Subscription is undefined');
      }

      const rgs = getAysncResult(
         this.az.listResourceGroups(wizardContext.kvSubscription)
      );
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(rgs, rgToItem)),
         {
            ignoreFocusOut,
            stepName: 'KV Resource Group',
            placeHolder: 'Key Vault Resource Group',
            noPicksMessage: 'No Resource Groups found'
         }
      );

      wizardContext.kvResourceGroup = (await rgs).find(
         (rg) => rgToItem(rg).label === rgPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptKv extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.kvSubscription === undefined) {
         throw Error('Key Vault Subscription undefined');
      }
      if (wizardContext.kvResourceGroup === undefined) {
         throw Error('Key Vault Resource Group undefined');
      }

      const kvs = getAysncResult(
         this.az.listKeyVaults(
            wizardContext.kvSubscription,
            wizardContext.kvResourceGroup
         )
      );
      const kvToItem = (kv: KeyVaultItem) => ({label: kv.vault.name || ''});
      const kvPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(kvs, kvToItem)),
         {
            ignoreFocusOut,
            stepName: 'Key Vault',
            placeHolder: 'Key Vault',
            noPicksMessage: 'No Key Vaults found'
         }
      );

      wizardContext.kv = (await kvs).find(
         (kv) => kvToItem(kv).label === kvPick.label
      );
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}
