import {
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {AzApi, SubscriptionItem} from '../../../utils/az';
import {getAysncResult} from '../../../utils/errorable';
import {getAsyncOptions, removeRecentlyUsed} from '../../../utils/quickPick';
import {sort} from '../../../utils/sort';

export const ignoreFocusOut = true;

// from https://stackoverflow.com/a/49752227
// used to type a key of an object and ensure that the value to that key is a certain type
type KeyOfType<T, V> = keyof {
   [P in keyof T as T[P] extends V ? P : never]: any;
};

export class PromptSubscription<
   T extends IActionContext
> extends AzureWizardPromptStep<T> {
   constructor(
      private az: AzApi,
      private contextKey: KeyOfType<T, SubscriptionItem | undefined>,
      private opts: Partial<{
         stepName: string;
         placeholder: string;
         prompt: (t: T) => boolean;
      }>
   ) {
      super();
   }

   public async prompt(wizardContext: T): Promise<void> {
      const subs = getAysncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: this.opts.stepName || 'Subscription',
            placeHolder: this.opts.placeholder || 'Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      // @ts-ignore TypeScript has trouble understanding context key but this is correctly typed
      wizardContext[this.contextKey] = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: T): boolean {
      if (typeof this.opts.prompt === 'undefined') {
         return true;
      }

      return this.opts.prompt(wizardContext);
   }
}
