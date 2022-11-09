import {
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {ValidatePort} from '../../../utils/validation';

export const ignoreFocusOut = true;

export class PromptPort extends AzureWizardPromptStep<
   IActionContext & Partial<{port: string}>
> {
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
      return true;
   }
}
