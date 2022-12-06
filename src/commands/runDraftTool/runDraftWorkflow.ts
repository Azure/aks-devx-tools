import {Context} from './model/context';
import * as vscode from 'vscode';
import {downloadDraftBinary, runDraftCommand} from './helper/runDraftHelper';
import {
    AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {ignoreFocusOut} from './helper/commonPrompts';
import {
   buildGenerateWorkflowCommand
} from './helper/draftCommandBuilder';
import { longRunning } from '../../utils/host';
import { Az, AzApi, getAzureAccount, ManagedClusterItem, RegistryItem, RepositoryItem, ResourceGroupItem, SubscriptionItem } from '../../utils/az';
import { getAysncResult } from '../../utils/errorable';
import { sort } from '../../utils/sort';

const title = 'Draft a GitHub Actions Workflow';

interface PromptContext {
    destination: vscode.Uri,
    clusterSubscription: SubscriptionItem,
    clusterResourceGroup: ResourceGroupItem,
    cluster: ManagedClusterItem,
    acrSubscription: SubscriptionItem,
    acrResourceGroup: ResourceGroupItem,
    registry: RegistryItem,
    acrRepository: RepositoryItem,
    branch: string
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftWorkflow(
    {actionContext, extensionContext}: Context
) {
    const az: AzApi = new Az(getAzureAccount());
    
    // Ensure Draft Binary
    const downloadResult = await longRunning(`Downloading Draft.`, () =>
        downloadDraftBinary()
    );
    if (!downloadResult) {
        vscode.window.showErrorMessage('Failed to download Draft');
        return undefined;
    }

    let outputDirectory = undefined;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length !== 0) {
        outputDirectory = workspaceFolders[0].uri;
    }

    const promptSteps: IPromptStep[] = [
        new PromptAKSSubscriptionSelection(az),
        new PromptAKSResourceGroupSelection(az),
        new PromptAKSClusterSelection(az),
        new PromptACRSubscriptionSelection(az),
        new PromptACRResourceGroupSelection(az),
        new PromptACRSelection(az),
        new PromptACRRegistrySelection(az),
        new PromptGitHubBranchSelection()
    ];
    const executeSteps: IExecuteStep[] = [
        new ExecuteDraftWorkflow()
    ];

    const wizardContext: WizardContext = {
        ...actionContext,
        destination: outputDirectory
    };

    const wizard = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });
    await wizard.prompt();
    await wizard.execute();
}

class PromptAKSSubscriptionSelection extends AzureWizardPromptStep<WizardContext> {
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
  
        const rgs = getAysncResult(
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
   
        const mcs = getAysncResult(
            this.az.listManagedClustersBySubAndRG(wizardContext.clusterSubscription, wizardContext.clusterResourceGroup)
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
        const subs = getAysncResult(this.az.listSubscriptions());
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
        if (wizardContext.acrSubscription === undefined) {
           throw Error('ACR Subscription is undefined');
        }
  
        const rgs = getAysncResult(
           this.az.listResourceGroups(wizardContext.acrSubscription)
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
    if (wizardContext.acrSubscription === undefined) {
        throw Error('ACR Subscription is undefined');
    }
    if (wizardContext.acrResourceGroup === undefined) {
        throw Error('ACR Resource Group is undefined');
    }

    const registries = getAysncResult(
        this.az.listContainerRegistries(
            wizardContext.acrSubscription,
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
        if (wizardContext.acrSubscription === undefined) {
            throw Error('ACR Subscription is undefined');
        }
        if (wizardContext.registry === undefined) {
            throw Error('ACR Registry is undefined');
        }
   
        const repositories = getAysncResult(
            this.az.listRegistryRepositories(
                wizardContext.acrSubscription,
                wizardContext.registry
            )
        );
        const repositoryToItem = (r: RepositoryItem) => ({
            label: r.repositoryName
        });
        
        const repositoryPick = await wizardContext.ui.showQuickPick(
            sort(getAsyncOptions(repositories, repositoryToItem)),
            {
                ignoreFocusOut,
                stepName: 'Repository',
                placeHolder: 'Repository',
                noPicksMessage: 'No Repositories found'
            }
        );
   
        wizardContext.acrRepository = (await repositories).find(
            (r) => repositoryToItem(r).label === repositoryPick.label
        );
    }
  
     public shouldPrompt(wizardContext: WizardContext): boolean {
        return true;
     }
}

class PromptGitHubBranchSelection extends AzureWizardPromptStep<WizardContext> {
    public async prompt(wizardContext: WizardContext): Promise<void> {
        const branchOptions: vscode.QuickPickItem[] = [{label: 'testbranch1'}];
        const selectedBranch = await wizardContext.ui.showQuickPick(branchOptions, {
            ignoreFocusOut,
            stepName: 'GitHub Branch',
            placeHolder: 'GitHub Branch'
        });

        wizardContext.branch = selectedBranch.label;
    }

    public shouldPrompt(wizardContext: WizardContext): boolean {
        return !(!!wizardContext.branch);
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
       const {destination, clusterSubscription, clusterResourceGroup, cluster, acrSubscription, acrResourceGroup, registry, acrRepository, branch} =
          wizardContext;
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
       if (acrSubscription === undefined) {
          throw Error('ACR Subscription is undefined');
       }
       if (acrResourceGroup === undefined) {
          throw Error('ACR Resource Group is undefined');
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
          cluster.managedCluster.id || '',
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

async function getAsyncOptions<T>(
    arr: Promise<T[]>,
    callbackfn: (a: T) => vscode.QuickPickItem
 ): Promise<vscode.QuickPickItem[]> {
    return (await arr).map(callbackfn);
 }