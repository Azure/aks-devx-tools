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
import {ValidateImage, ValidateRfc1123} from '../../utils/validation';
import {PromptPort, ignoreFocusOut} from './helper/commonPrompts';
import {
   KubernetesApi,
   Kubernetes,
   getDefaultKubeconfig,
   getHelm,
   getKubectl
} from '../../utils/kubernetes';
import {failed} from '../../utils/errorable';
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
   outputFolder: vscode.Uri | undefined
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
      workspaceFolders === undefined ? '' : workspaceFolders[0].name;
   const wizardContext: WizardContext = {
      ...actionContext,
      port: state.getPort(),
      outputFolder: outputFolder,
      applicationName: applicationNameGuess
   };
   const promptSteps: IPromptStep[] = [
      new PromptOutputFolder(),
      new PromptFormat(),
      new PromptFileOverride(),
      new PromptApplicationName(),
      new PromptPort(),
      new PromptNamespace(k8s),
      new PromptNewNamespace(),
      new PromptImageOption(),
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
      new ExecuteOpenFiles()
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
      const namespacesReturn = await this.k8s.listNamespaces();
      if (failed(namespacesReturn)) {
         throw Error(namespacesReturn.error);
      }
      const namespaces = namespacesReturn.result;

      const newOption = 'New Namespace';
      const namespaceOptions: vscode.QuickPickItem[] = namespaces.map(
         (version) => ({
            label: version.metadata?.name || ''
         })
      );
      const options: vscode.QuickPickItem[] = [
         {label: newOption},
         {label: '', kind: vscode.QuickPickItemKind.Separator},
         ...namespaceOptions,
         {
            label: 'Existing namespaces',
            kind: vscode.QuickPickItemKind.Separator
         }
      ];
      const namespacePick = await wizardContext.ui.showQuickPick(options, {
         ignoreFocusOut,
         stepName: 'Namespace',
         placeHolder: 'Namespace'
      });

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
      return true;
   }
}

class PromptImage extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.image = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'Image',
         stepName: 'Image',
         validateInput: ValidateImage
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
      const subsReturn = await this.az.listSubscriptions();
      if (failed(subsReturn)) {
         throw Error(subsReturn.error);
      }
      const subs = subsReturn.result;
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subOptions: vscode.QuickPickItem[] = subs.map(subToItem);
      const subPick = await wizardContext.ui.showQuickPick(subOptions, {
         ignoreFocusOut,
         stepName: 'ACR Subscription',
         placeHolder: 'ACR Subscription',
         noPicksMessage: 'No Subscriptions found'
      });

      // if something was recently used this text is appened to the descritpion
      const removeRecentlyUsed = (description: string) =>
         description.replace(' (recently used)', '');
      wizardContext.acrSubscription = subs.find(
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

      const rgsReturn = await this.az.listResourceGroups(
         wizardContext.acrSubscription
      );
      if (failed(rgsReturn)) {
         throw Error(rgsReturn.error);
      }
      const rgs = rgsReturn.result;
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgOptions: vscode.QuickPickItem[] = rgs.map(rgToItem);
      const rgPick = await wizardContext.ui.showQuickPick(rgOptions, {
         ignoreFocusOut,
         stepName: 'ACR Resource Group',
         placeHolder: 'ACR Resource Group',
         noPicksMessage: 'No Resource Groups found'
      });

      wizardContext.acrResourceGroup = rgs.find(
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

      const registriesReturn = await this.az.listContainerRegistries(
         wizardContext.acrSubscription,
         wizardContext.acrResourceGroup
      );
      if (failed(registriesReturn)) {
         throw Error(registriesReturn.error);
      }
      const registries = registriesReturn.result;
      const registryToItem = (r: RegistryItem) => ({
         label: r.registry.name || ''
      });
      const registryOptions: vscode.QuickPickItem[] =
         registries.map(registryToItem);
      const registryPick = await wizardContext.ui.showQuickPick(
         registryOptions,
         {
            ignoreFocusOut,
            stepName: 'Registry',
            placeHolder: 'Registry',
            noPicksMessage: 'No Registries found'
         }
      );

      wizardContext.acrRegistry = registries.find(
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

      const repositoriesReturn = await this.az.listRegistryRepositories(
         wizardContext.acrSubscription,
         wizardContext.acrRegistry
      );
      if (failed(repositoriesReturn)) {
         throw Error(repositoriesReturn.error);
      }
      const repositories = repositoriesReturn.result;

      const repositoryToItem = (r: RepositoryItem) => ({
         label: r.repositoryName
      });
      const repositoryOptions: vscode.QuickPickItem[] =
         repositories.map(repositoryToItem);
      const repositoryPick = await wizardContext.ui.showQuickPick(
         repositoryOptions,
         {
            ignoreFocusOut,
            stepName: 'Repository',
            placeHolder: 'Repository',
            noPicksMessage: 'No Repositories found'
         }
      );

      wizardContext.acrRepository = repositories.find(
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

      const tagsReturn = await this.az.listRepositoryTags(
         wizardContext.acrSubscription,
         wizardContext.acrRegistry,
         wizardContext.acrRepository
      );
      if (failed(tagsReturn)) {
         throw Error(tagsReturn.error);
      }
      const tags = tagsReturn.result;
      const tagToItem = (t: TagItem) => ({label: t.tag.name || ''});
      const tagOptions: vscode.QuickPickItem[] = tags.map(tagToItem);
      const tagPick = await wizardContext.ui.showQuickPick(tagOptions, {
         ignoreFocusOut,
         stepName: 'Tag',
         placeHolder: 'Tag',
         noPicksMessage: 'No tags found'
      });

      wizardContext.acrTag = tags.find(
         (t) => tagToItem(t).label === tagPick.label
      );

      wizardContext.image = `${wizardContext.acrRegistry.registry.loginServer}/${wizardContext.acrRepository.repositoryName}:${wizardContext.acrTag?.tag.name}`;
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
      return !!wizardContext.newNamespace;
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
         outputFolder.path,
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
         if (fs.lstatSync(file.path).isDirectory()) {
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

function getOutputPath(wizardContext: WizardContext): string {
   const base = wizardContext.outputFolder?.path;
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

// TODO: switch up promises to show loading in quick pick
