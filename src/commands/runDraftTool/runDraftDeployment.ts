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
import {
   ValidateImage,
   ValidatePort,
   ValidateRfc1123
} from '../../utils/validation';
import {ignoreFocusOut} from './helper/commonPrompts';
import {
   KubernetesApi,
   Kubernetes,
   getDefaultKubeconfig,
   getHelm,
   getKubectl
} from '../../utils/kubernetes';
import {failed, getAysncResult} from '../../utils/errorable';
import {
   RegistryItem,
   RepositoryItem,
   ResourceGroupItem,
   SubscriptionItem,
   TagItem,
   AzApi,
   getAzureAccount,
   Az
} from '../../utils/az';
import * as path from 'path';
import * as fs from 'fs';
import {
   buildCreateCommand,
   buildCreateConfig
} from './helper/draftCommandBuilder';
import {image} from '../../utils/acr';
import {CompletedSteps} from './model/guidedExperience';
import {sort} from '../../utils/sort';

const title = 'Draft a Kubernetes Deployment and Service';

enum imageOption {
   ACR,
   Other
}
interface PromptContext {
   outputFolder: vscode.Uri;
   applicationName: string;
   format: DraftFormat;
   namespace: string;
   newNamespace: boolean;
   image: string;
   imageOption: imageOption;
   acrSubscription: SubscriptionItem;
   acrResourceGroup: ResourceGroupItem;
   acrRegistry: RegistryItem;
   acrRepository: RepositoryItem;
   acrTag: TagItem;
   port: string;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftDeployment(
   {actionContext, extensionContext}: Context,
   outputFolder: vscode.Uri | undefined,
   completedSteps: CompletedSteps
) {
   const state: StateApi = State.construct(extensionContext);
   const kubeconfig = getDefaultKubeconfig();
   const kubectlReturn = await getKubectl();
   if (failed(kubectlReturn)) {
      throw Error(kubectlReturn.error);
   }
   const helmReturn = await getHelm();
   if (failed(helmReturn)) {
      throw Error(helmReturn.error);
   }
   const k8s: KubernetesApi = new Kubernetes(
      kubeconfig,
      kubectlReturn.result,
      helmReturn.result
   );
   const az: AzApi = new Az(getAzureAccount());

   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   const workspaceFolders = vscode.workspace.workspaceFolders;
   if (!outputFolder && workspaceFolders && workspaceFolders.length !== 0) {
      outputFolder = workspaceFolders[0].uri;
   }

   const applicationNameGuess =
      workspaceFolders === undefined
         ? ''
         : workspaceFolders[0].name.toLowerCase().replace(/[^a-z0-9-]+/g, '');
   const wizardContext: WizardContext = {
      ...actionContext,
      port: state.getPort(),
      outputFolder: outputFolder,
      applicationName: applicationNameGuess,
      image: state.getImage()
   };
   const promptSteps: IPromptStep[] = [
      new PromptOutputFolder(),
      new PromptFormat(),
      new PromptFileOverride(),
      new PromptApplicationName(),
      new PromptPort(completedSteps),
      new PromptNamespace(k8s),
      new PromptNewNamespace(),
      new PromptImageOption(completedSteps),
      new PromptImage(),
      new PromptAcrSubscription(az),
      new PromptAcrResourceGroup(az),
      new PromptAcrRegistry(az),
      new PromptAcrRepository(az),
      new PromptAcrTag(az)
   ];
   const executeSteps: IExecuteStep[] = [
      new ExecuteCreateNamespace(k8s),
      new ExecuteDraft(),
      new ExecuteOpenFiles(),
      new ExecuteSaveState(state),
      new ExecutePromptDeploy(completedSteps)
   ];
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
         validateInput: ValidateRfc1123,
         value: wizardContext.applicationName
      });
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptNamespace extends AzureWizardPromptStep<WizardContext> {
   constructor(private k8s: KubernetesApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const namespaces = getAysncResult(this.k8s.listNamespaces());
      const newOption = 'New Namespace';
      const getOptions = async (): Promise<vscode.QuickPickItem[]> => {
         const namespaceOptions: vscode.QuickPickItem[] = (
            await namespaces
         ).map((version) => ({
            label: version.metadata?.name || ''
         }));

         return [
            {label: newOption},
            {label: '', kind: vscode.QuickPickItemKind.Separator},
            ...namespaceOptions,
            {
               label: 'Existing namespaces',
               kind: vscode.QuickPickItemKind.Separator
            }
         ];
      };
      const namespacePick = await wizardContext.ui.showQuickPick(
         sort(getOptions()),
         {
            ignoreFocusOut,
            stepName: 'Namespace',
            placeHolder: 'Namespace'
         }
      );

      if (namespacePick.label === newOption) {
         wizardContext.newNamespace = true;
         return;
      }

      wizardContext.newNamespace = false;
      wizardContext.namespace = namespacePick.label;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptNewNamespace extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.namespace = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'New Namespace',
         stepName: 'New Namespace',
         validateInput: ValidateRfc1123,
         value: wizardContext.namespace || wizardContext.applicationName // application name is a reasonable autofill guess
      });
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return wizardContext.newNamespace === true;
   }
}

class PromptImageOption extends AzureWizardPromptStep<WizardContext> {
   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const acr = 'Azure Container Registry';
      const other = 'Other';
      const options: vscode.QuickPickItem[] = [acr, other].map((k) => ({
         label: k
      }));

      const imagePick = await wizardContext.ui.showQuickPick(options, {
         ignoreFocusOut,
         stepName: 'Image Option',
         placeHolder: 'Image Option'
      });

      wizardContext.imageOption =
         imagePick.label === acr ? imageOption.ACR : imageOption.Other;
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return !(this.completedSteps.buildOnAcr && !!wizardContext.image);
   }
}

class PromptImage extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.image = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'Image',
         stepName: 'Image',
         validateInput: ValidateImage,
         value: wizardContext.image
      });
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return wizardContext.imageOption === imageOption.Other;
   }
}

class PromptAcrSubscription extends AzureWizardPromptStep<WizardContext> {
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
            stepName: 'ACR Subscription',
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
      return wizardContext.imageOption === imageOption.ACR;
   }
}

class PromptAcrResourceGroup extends AzureWizardPromptStep<WizardContext> {
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
      return wizardContext.imageOption === imageOption.ACR;
   }
}

class PromptAcrRegistry extends AzureWizardPromptStep<WizardContext> {
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

      wizardContext.acrRegistry = (await registries).find(
         (r) => registryToItem(r).label === registryPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return wizardContext.imageOption === imageOption.ACR;
   }
}

class PromptAcrRepository extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.acrSubscription === undefined) {
         throw Error('ACR Subscription is undefined');
      }
      if (wizardContext.acrRegistry === undefined) {
         throw Error('ACR Registry is undefined');
      }

      const repositories = getAysncResult(
         this.az.listRegistryRepositories(
            wizardContext.acrSubscription,
            wizardContext.acrRegistry
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
      return wizardContext.imageOption === imageOption.ACR;
   }
}

class PromptAcrTag extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.acrSubscription === undefined) {
         throw Error('ACR Subscription is undefined');
      }
      if (wizardContext.acrRegistry === undefined) {
         throw Error('ACR Registry is undefined');
      }
      if (wizardContext.acrRepository === undefined) {
         throw Error('ACR Repository is undefined');
      }

      const tags = getAysncResult(
         this.az.listRepositoryTags(
            wizardContext.acrSubscription,
            wizardContext.acrRegistry,
            wizardContext.acrRepository
         )
      );
      const tagToItem = (t: TagItem) => ({label: t.tag.name || ''});
      const tagPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(tags, tagToItem)),
         {
            ignoreFocusOut,
            stepName: 'Tag',
            placeHolder: 'Tag',
            noPicksMessage: 'No tags found'
         }
      );

      wizardContext.acrTag = (await tags).find(
         (t) => tagToItem(t).label === tagPick.label
      );

      const server = wizardContext.acrRegistry.registry.loginServer;
      if (server === undefined) {
         throw Error('Server is undefined');
      }
      const repository = wizardContext.acrRepository.repositoryName;
      if (repository === undefined) {
         throw Error('Repository is undefined');
      }
      const tag = wizardContext.acrTag?.tag.name;
      if (tag === undefined) {
         throw Error('Tag is undefined');
      }
      wizardContext.image = image(server, repository, tag);
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return wizardContext.imageOption === imageOption.ACR;
   }
}

class PromptFileOverride extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const output = getOutputPath(wizardContext);
      await wizardContext.ui.showWarningMessage(
         `Override files in ${output}`,
         {
            modal: true
         },
         {title: 'Ok'}
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      const output = getOutputPath(wizardContext);
      if (fs.existsSync(output)) {
         return true;
      }

      return false;
   }
}

export class PromptPort extends AzureWizardPromptStep<
   IActionContext & Partial<{port: string}>
> {
   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async prompt(
      wizardContext: IActionContext & Partial<{port: string}>
   ): Promise<void> {
      wizardContext.port = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'Port (e.g. 8080)',
         stepName: 'Port',
         validateInput: ValidatePort,
         value: wizardContext.port
      });
   }

   public shouldPrompt(
      wizardContext: IActionContext & Partial<{port: string}>
   ): boolean {
      return !(this.completedSteps.draftDockerfile && !!wizardContext.port);
   }
}

class ExecuteCreateNamespace extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 1;

   constructor(private k8s: KubernetesApi) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const {namespace} = wizardContext;
      if (namespace === undefined) {
         throw Error('Namespace is undefined');
      }

      const result = await this.k8s.createNamespace(namespace);
      if (failed(result)) {
         throw Error(result.error);
      }
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return (
         !!wizardContext.newNamespace &&
         wizardContext.format !== DraftFormat.Helm // Draft creates namespace manifest for Helm
      );
   }
}

class ExecuteDraft extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 2;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const {outputFolder, image, applicationName, namespace, port, format} =
         wizardContext;
      if (outputFolder === undefined) {
         throw Error('Output folder is undefined');
      }
      if (image === undefined) {
         throw Error('Image is undefined');
      }
      if (applicationName === undefined) {
         throw Error('Application name is undefined');
      }
      if (namespace === undefined) {
         throw Error('Namespace is undefined');
      }
      if (port === undefined) {
         throw Error('Port is undefined');
      }
      if (format === undefined) {
         throw Error('Format is undefined');
      }

      const configPath = buildCreateConfig(
         'java', // so it doesn't attempt to autodetect the language
         port,
         applicationName,
         format,
         '',
         namespace,
         image
      );
      const command = buildCreateCommand(
         outputFolder.fsPath,
         'deployment',
         configPath
      );
      const [success, err] = await runDraftCommand(command);
      const isSuccess = err?.length === 0 && success?.length !== 0;
      if (!isSuccess) {
         throw Error(`Draft command failed: ${err}`);
      }
   }
   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteOpenFiles extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 3;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const outputPath = getOutputPath(wizardContext);
      const relativePattern = new vscode.RelativePattern(outputPath, '**/*');
      const files = await vscode.workspace.findFiles(relativePattern);

      for (const file of files) {
         if (fs.lstatSync(file.fsPath).isDirectory()) {
            continue;
         }

         await vscode.workspace
            .openTextDocument(file)
            .then((doc) =>
               vscode.window.showTextDocument(doc, {preview: false})
            );
      }
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteSaveState extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 4;

   constructor(private state: StateApi) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const {port, format, namespace, applicationName} = wizardContext;
      if (port === undefined) {
         throw Error('port undefined');
      }
      if (format === undefined) {
         throw Error('format undefined');
      }
      if (namespace === undefined) {
         throw Error('namespace undefined');
      }
      if (applicationName === undefined) {
         throw Error('application name undefined');
      }

      this.state.setPort(port);
      this.state.setDeploymentFormat(format);
      this.state.setNamespace(namespace);
      this.state.setApplicationName(applicationName);

      const deploymentPath = getOutputPath(wizardContext);
      this.state.setDeploymentPath(deploymentPath);
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecutePromptDeploy extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 5;

   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const deployButton = 'Deploy';
      await vscode.window
         .showInformationMessage(
            'The Kubernetes Deployment and Service was created. Next, deploy to the cluster.',
            deployButton
         )
         .then((input) => {
            if (input === deployButton) {
               this.completedSteps.draftDeployment = true;
               vscode.commands.executeCommand(
                  'aks-draft-extension.runDeploy',
                  this.completedSteps
               );
            }
         });
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

function getOutputPath(wizardContext: WizardContext): string {
   const base = wizardContext.outputFolder?.fsPath;
   if (base === undefined) {
      throw Error('Output folder is undefined');
   }

   switch (wizardContext.format) {
      case DraftFormat.Helm:
         return path.join(base, 'charts');
      case DraftFormat.Kustomize:
         return path.join(base, 'base');
      default:
         return path.join(base, 'manifests');
   }
}

async function getAsyncOptions<T>(
   arr: Promise<T[]>,
   callbackfn: (a: T) => vscode.QuickPickItem
): Promise<vscode.QuickPickItem[]> {
   return (await arr).map(callbackfn);
}
