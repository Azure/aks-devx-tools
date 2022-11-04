import {failed} from '../../utils/errorable';
import {getExtensionPath, longRunning} from '../../utils/host';
import {Context} from './model/context';
import * as vscode from 'vscode';
import {downloadDraftBinary, runDraftCommand} from './helper/runDraftHelper';
import {DraftLanguage, draftLanguages} from './helper/languages';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as fs from 'fs';
import {
   buildCreateCommand,
   buildCreateConfig
} from './helper/draftCommandBuilder';
import {State, StateApi} from '../../utils/state';

const title = 'Draft a Dockerfile from source code';
const ignoreFocusOut = true;

interface PromptContext {
   sourceCodeFolder: vscode.Uri;
   language: DraftLanguage;
   version: string;
   port: string;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftDockerfile(
   {actionContext, extensionContext}: Context,
   sourceCodeFolder: vscode.Uri
) {
   const state: StateApi = State.construct(extensionContext);

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

   const wizardContext: WizardContext = {
      ...actionContext,
      sourceCodeFolder
   };
   const promptSteps: IPromptStep[] = [
      new PromptSourceCodeFolder(),
      new PromptDockerfileOverride(),
      new PromptLanguage(),
      new PromptVersion(),
      new PromptPort()
   ];
   const executeSteps: IExecuteStep[] = [
      new ExecuteDraft(),
      new ExecuteOpenDockerfiles(),
      new ExecuteSaveState(state)
   ];
   const wizard = new AzureWizard(wizardContext, {
      title,
      promptSteps,
      executeSteps
   });
   await wizard.prompt();
   await wizard.execute();
}

class PromptSourceCodeFolder extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.sourceCodeFolder = (
         await wizardContext.ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            stepName: 'Source Code Folder',
            openLabel: 'Choose Source Code Folder',
            defaultUri: wizardContext.sourceCodeFolder
         })
      )[0];

      // TODO: validate that source code folder is in workspace
      // what happens if folder isn't selected?
      // choose folder from right click if right clicked
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptLanguage extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const languageToItem = (lang: DraftLanguage) => ({label: lang.name});
      const languageOptions: vscode.QuickPickItem[] =
         draftLanguages.map(languageToItem);
      const languagePick = await wizardContext.ui.showQuickPick(
         languageOptions,
         {
            ignoreFocusOut,
            stepName: 'Programming Language',
            placeHolder: 'Select the programming language'
         }
      );
      const language = draftLanguages.find(
         (lang) => languageToItem(lang).label === languagePick.label
      );

      wizardContext.language = language;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptVersion extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const language = wizardContext.language;
      if (language === undefined) {
         throw Error('Language is undefined');
      }

      const versionOptions: vscode.QuickPickItem[] = language.versions.map(
         (version) => ({label: version})
      );
      const versionPick = await wizardContext.ui.showQuickPick(versionOptions, {
         ignoreFocusOut,
         stepName: 'Version',
         placeHolder: `Select ${language.name} version`
      });
      wizardContext.version = versionPick.label;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptPort extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.port = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'Port (e.g. 8080)',
         stepName: 'Port'
      });
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptDockerfileOverride extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const dockerfilePath = getDockerfilePath(wizardContext);
      await wizardContext.ui.showWarningMessage(
         `Override file ${dockerfilePath}`,
         {modal: true},
         {title: 'Ok'}
      );
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      const dockerfilePath = getDockerfilePath(wizardContext);
      if (fs.existsSync(dockerfilePath)) {
         return true;
      }

      return false;
   }
}

class ExecuteDraft extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 1;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const {language, port, sourceCodeFolder, version} = wizardContext;
      if (language === undefined) {
         throw Error('Language is undefined');
      }
      if (port === undefined) {
         throw Error('Port is undefined');
      }
      if (sourceCodeFolder === undefined) {
         throw Error('Source code folder is undefined');
      }
      if (version === undefined) {
         throw Error('Version is undefined');
      }

      const configPath = buildCreateConfig(language.id, port, '', '', version);
      const command = buildCreateCommand(
         sourceCodeFolder.path,
         'dockerfile',
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

class ExecuteOpenDockerfiles extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 2;
   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const dockerignorePath = getDockerignorePath(wizardContext);
      const dockerPath = getDockerfilePath(wizardContext);

      for (const filePath of [dockerignorePath, dockerPath]) {
         const vscodePath = vscode.Uri.file(filePath);
         await vscode.workspace
            .openTextDocument(vscodePath)
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
   public priority: number = 3;

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
      const {port} = wizardContext;
      if (port !== undefined) {
         this.state.setPort(port);
      }

      const dockerfilePath = getDockerfilePath(wizardContext);
      this.state.setDockerfile(dockerfilePath);
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

function getDockerfilePath(wizardContext: WizardContext): string {
   const sourceCodeFolderPath = wizardContext.sourceCodeFolder?.path;
   if (sourceCodeFolderPath === undefined) {
      throw Error('Source code folder is undefined');
   }

   return path.join(sourceCodeFolderPath, 'Dockerfile');
}

function getDockerignorePath(wizardContext: WizardContext): string {
   const sourceCodeFolderPath = wizardContext.sourceCodeFolder?.path;
   if (sourceCodeFolderPath === undefined) {
      throw Error('Source code folder is undefined');
   }

   return path.join(sourceCodeFolderPath, '.dockerignore');
}
