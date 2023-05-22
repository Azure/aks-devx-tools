import {Context} from './model/context';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {ensureDraftBinary, runDraftCommand} from './helper/runDraftHelper';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {ignoreFocusOut} from './helper/commonPrompts';
import {buildGenerateWorkflowCommand} from './helper/draftCommandBuilder';
import {longRunning} from '../../utils/host';
import {
   Az,
   AzApi,
   getAzCreds,
   ManagedClusterItem,
   RegistryItem,
   RepositoryItem,
   ResourceGroupItem,
   SubscriptionItem
} from '../../utils/az';
import {getAsyncResult} from '../../utils/errorable';
import {sort} from '../../utils/sort';
import {getBranches} from '../../utils/gitExtension';
import {Branch, Ref} from '../../utils/git';
import path = require('path');
import {getAsyncOptions} from '../../utils/quickPick';

const title = 'Draft a GitHub Actions Workflow';

interface PromptContext {
   destination: vscode.Uri;
   clusterSubscription: SubscriptionItem;
   clusterResourceGroup: ResourceGroupItem;
   cluster: ManagedClusterItem;
   acrSubscription: SubscriptionItem;
   acrResourceGroup: ResourceGroupItem;
   registry: RegistryItem;
   newRepository: boolean;
   acrRepository: RepositoryItem;
   branch: string;
   selectRepoDir: boolean;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftWorkflow({
   actionContext,
   extensionContext
}: Context) {
   const az: AzApi = new Az(getAzCreds);

   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft.`, () =>
      ensureDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
   ) {
      throw Error('No directories within current vscode wokspace.');
   }

   const promptSteps: IPromptStep[] = [
      new PromptAKSSubscriptionSelection(az),
      new PromptAKSResourceGroupSelection(az),
      new PromptAKSClusterSelection(az),
      // Currently we dont allow seperate sub for ACR selection while generating through draft
      // new PromptACRSubscriptionSelection(az),
      new PromptACRResourceGroupSelection(az),
      new PromptACRSelection(az),
      new PromptACRRegistrySelection(az),
      new PromptNewRepository(),
      new PromptGitHubBranchSelection()
   ];
   const executeSteps: IExecuteStep[] = [
      new ExecuteDraftWorkflow(),
      new ExecuteOpenWorkflowFile()
   ];

   const wizardContext: WizardContext = {
      ...actionContext,
      destination: vscode.workspace.workspaceFolders[0].uri
   };

   const wizard = new AzureWizard(wizardContext, {
      title,
      promptSteps,
      executeSteps
   });
   await wizard.prompt();
   await wizard.execute();
   const openOIDCDocs = 'OIDC Docs';
   const oidcDocsLink =
      'learn.microsoft.com/en-us/azure/developer/github/connect-from-azure?tabs=azure-portal%2Clinux#use-the-azure-login-action-with-openid-connect';
   vscode.window
      .showInformationMessage(
         `Workflow Created. You must set up OIDC on your repository`,
         openOIDCDocs
      )
      .then((input) => {
         if (input === openOIDCDocs) {
            vscode.commands.executeCommand(
               'vscode.open',
               vscode.Uri.parse(`https://${oidcDocsLink}`)
            );
         }
      });
}
class PromptAKSSubscriptionSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const subs = getAsyncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: 'Azure Kubernetes Service (AKS) Subscription',
            placeHolder: 'AKS Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      // if something was recently used this text is appened to the description
      const removeRecentlyUsed = (description: string) =>
         description.replace(' (recently used)', '');
      wizardContext.clusterSubscription = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptAKSResourceGroupSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.clusterSubscription === undefined) {
         throw Error('AKS Subscription is undefined');
      }

      const rgs = getAsyncResult(
         this.az.listResourceGroups(wizardContext.clusterSubscription)
      );
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(rgs, rgToItem)),
         {
            ignoreFocusOut,
            stepName: 'AKS Resource Group',
            placeHolder: 'AKS Resource Group',
            noPicksMessage: 'No Resource Groups found'
         }
      );

      wizardContext.clusterResourceGroup = (await rgs).find(
         (rg) => rgToItem(rg).label === rgPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptAKSClusterSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.clusterSubscription === undefined) {
         throw Error('AKS Subscription is undefined');
      }

      if (wizardContext.clusterResourceGroup === undefined) {
         throw Error('AKS Resource Group is undefined');
      }

      const mcs = getAsyncResult(
         this.az.listAksClusters(
            wizardContext.clusterSubscription,
            wizardContext.clusterResourceGroup
         )
      );
      const mcToItem = (mc: ManagedClusterItem) => ({
         label: mc.managedCluster.name || ''
      });
      const mcPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(mcs, mcToItem)),
         {
            ignoreFocusOut,
            stepName: 'AKS Cluster',
            placeHolder: 'AKS Cluster',
            noPicksMessage: 'No AKS Cluster Found'
         }
      );

      wizardContext.cluster = (await mcs).find(
         (mc) => mcToItem(mc).label === mcPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptACRSubscriptionSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const subs = getAsyncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: 'Azure Container Registry (ACR) Subscription',
            placeHolder: 'ACR Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      // if something was recently used this text is appened to the description
      const removeRecentlyUsed = (description: string) =>
         description.replace(' (recently used)', '');
      wizardContext.acrSubscription = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptACRResourceGroupSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.clusterSubscription === undefined) {
         throw Error('AKS Subscription is undefined');
      }

      const rgs = getAsyncResult(
         this.az.listResourceGroups(wizardContext.clusterSubscription)
      );
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(rgs, rgToItem)),
         {
            ignoreFocusOut,
            stepName: 'ACR Resource Group',
            placeHolder: 'ACR Resource Group',
            noPicksMessage: 'No Resource Groups found'
         }
      );

      wizardContext.acrResourceGroup = (await rgs).find(
         (rg) => rgToItem(rg).label === rgPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptACRSelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.clusterSubscription === undefined) {
         throw Error('ACR Subscription is undefined');
      }
      if (wizardContext.acrResourceGroup === undefined) {
         throw Error('ACR Resource Group is undefined');
      }

      const registries = getAsyncResult(
         this.az.listContainerRegistries(
            wizardContext.clusterSubscription,
            wizardContext.acrResourceGroup
         )
      );

      const registryToItem = (r: RegistryItem) => ({
         label: r.registry.name || ''
      });

      const registryPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(registries, registryToItem)),
         {
            ignoreFocusOut,
            stepName: 'Registry',
            placeHolder: 'Registry',
            noPicksMessage: 'No Registries found'
         }
      );

      wizardContext.registry = (await registries).find(
         (r) => registryToItem(r).label === registryPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptACRRegistrySelection extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.clusterSubscription === undefined) {
         throw Error('ACR Subscription is undefined');
      }
      if (wizardContext.registry === undefined) {
         throw Error('ACR Registry is undefined');
      }
      const newOption = 'Create new repository';

      const repositories = getAsyncResult(
         this.az.listRegistryRepositories(wizardContext.registry)
      );
      const repositoryToItem = (r: RepositoryItem) => ({
         label: r.repositoryName
      });

      const getOptions = async (): Promise<vscode.QuickPickItem[]> => {
         const repositoryOptions = (await repositories).map(repositoryToItem);
         return [
            {label: newOption},
            {label: '', kind: vscode.QuickPickItemKind.Separator},
            ...repositoryOptions,
            {
               label: 'Existing Repositories',
               kind: vscode.QuickPickItemKind.Separator
            }
         ];
      };

      const repositoryPick = await wizardContext.ui.showQuickPick(
         getOptions(),
         {
            ignoreFocusOut,
            stepName: 'Repository',
            placeHolder: 'Repository',
            noPicksMessage: 'No Repositories found'
         }
      );

      if (repositoryPick.label === newOption) {
         wizardContext.newRepository = true;
         return;
      }

      wizardContext.acrRepository = (await repositories).find(
         (r) => repositoryToItem(r).label === repositoryPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptNewRepository extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const newRepository = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         stepName: 'New Repository',
         prompt: 'New Repository',
         validateInput: (value) => {
            if (value === undefined || value === '') {
               return 'Repository name cannot be empty';
            }
            return undefined;
         }
      });

      wizardContext.acrRepository = {
         repositoryName: newRepository
      };
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return wizardContext.newRepository === true;
   }
}

class PromptGitHubBranchSelection extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.destination === undefined) {
         throw Error('Git Directory is Undefined');
      }
      let branches = await getBranches(wizardContext.destination);
      branches = branches.filter(
         (b) => b.remote !== undefined && b.remote !== ''
      );

      const branchToItem = (b: Branch): vscode.QuickPickItem => ({
         label: b.name?.replace(b.remote + '/', '') || ''
      });
      const branchOptions = branches.map(branchToItem);

      const selectedBranch = await wizardContext.ui.showQuickPick(
         branchOptions,
         {
            ignoreFocusOut,
            stepName: 'GitHub Branch',
            placeHolder: 'GitHub Branch'
         }
      );

      wizardContext.branch = selectedBranch.label;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteDraftWorkflow extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 2;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const {
         destination,
         clusterSubscription,
         clusterResourceGroup,
         cluster,
         acrSubscription,
         acrResourceGroup,
         registry,
         acrRepository,
         branch
      } = wizardContext;
      if (destination === undefined) {
         throw Error('Output folder is undefined');
      }
      if (clusterSubscription === undefined) {
         throw Error('AKS Subscription is undefined');
      }
      if (clusterResourceGroup === undefined) {
         throw Error('AKS Resource Group is undefined');
      }
      if (cluster === undefined) {
         throw Error('AKS Cluster is undefined');
      }
      if (acrResourceGroup === undefined) {
         throw Error('AKS Resource Group is undefined');
      }
      if (registry === undefined) {
         throw Error('ACR Registry is undefined');
      }
      if (acrRepository === undefined) {
         throw Error('ACR Repository is undefined');
      }
      if (branch === undefined) {
         throw Error('Branch is undefined');
      }

      const generateWorkflowCmd = buildGenerateWorkflowCommand(
         destination.fsPath,
         cluster.managedCluster.name || '',
         clusterResourceGroup.resourceGroup.name || '',
         registry.registry.name || '',
         acrRepository.repositoryName,
         branch
      );
      const [success, err] = await runDraftCommand(generateWorkflowCmd);
      const isSuccess = err?.length === 0 && success?.length !== 0;
      if (!isSuccess) {
         throw Error(`Draft command failed: ${err}`);
      }
   }
   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteOpenWorkflowFile extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 3;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const outputPath = getWorkflowPath(wizardContext);

      await vscode.workspace
         .openTextDocument(outputPath)
         .then((doc) => vscode.window.showTextDocument(doc, {preview: false}));
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

function getWorkflowPath(wizardContext: WizardContext): string {
   if (wizardContext.destination === undefined) {
      throw Error('destination directory undefined');
   }

   let fileName = 'azure-kubernetes-service.yml';
   if (fs.existsSync(path.join(wizardContext.destination.fsPath, 'charts'))) {
      fileName = 'azure-kubernetes-service-helm.yml';
   } else if (
      fs.existsSync(path.join(wizardContext.destination.fsPath, 'overlays'))
   ) {
      fileName = 'azure-kubernetes-service-kustomize.yml';
   }

   return path.join(
      wizardContext.destination.fsPath,
      '.github',
      'workflows',
      fileName
   );
}
