import { AzureAccountExtensionApi } from "./azAccount";
import { commands } from "vscode";
import { Errorable } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
}

// TODO: add any needed az interactions
// use subscription fn and https://github.com/microsoft/vscode-azure-account/blob/main/sample/src/extension.ts
// as reference. Note that things like resource groups will take a subscription as a parameter like the linked example 
export class Az {
  constructor(private azAccount: AzureAccountExtensionApi) {}

  async getSubscriptions(): Promise<Errorable<Subscription[]>> {
    if (!(await this.azAccount.waitForLogin())) {
      commands.executeCommand("azure-account.askForLogin");
      return { succeeded: false, error: "failed to login" };
    }
    await this.azAccount.waitForFilters();

    const subs: Subscription[] = [];
    for (const session of this.azAccount.sessions) {
      const credentials = session.credentials2;
      const subscriptionClient = new SubscriptionClient(credentials);

      // TODO: turn this logic into a generic
      const subscriptionPages = subscriptionClient.subscriptions
        .list()
        .byPage();
      for await (const page of subscriptionPages) {
        subs.push(...page);
      }
    }

    return { succeeded: true, result: subs };
  }
}
