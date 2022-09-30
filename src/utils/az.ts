import { AzureAccountExtensionApi } from "./azAccount";
import { commands } from "vscode";
import { Errorable } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { ResourceManagementClient, ResourceGroup } from '@azure/arm-resources';
import { longRunning } from "./host";

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
  getResourceGroups(subscriptionId: string): Promise<Errorable<ResourceGroup[]>>;
}

// TODO: add any needed az interactions
// use subscription fn and https://github.com/microsoft/vscode-azure-account/blob/main/sample/src/extension.ts
// as reference. Note that things like resource groups will take a subscription as a parameter like the linked example 
export class Az {
  constructor(private azAccount: AzureAccountExtensionApi) {}

  async checkLoginAndFilters(): Promise<Errorable<void>> {
    if (!(await this.azAccount.waitForLogin())) {
      commands.executeCommand("azure-account.askForLogin");
      return { succeeded: false, error: "failed to login" };
    }
    await this.azAccount.waitForFilters();
    return { succeeded: true, result: undefined };
  }

  async getSubscriptions(): Promise<Errorable<Subscription[]>> {
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    }

    const subs: Subscription[] = [];
    for (const session of this.azAccount.sessions) {
      const credentials = session.credentials2;
      const subscriptionClient = new SubscriptionClient(credentials);

      // TODO: turn this logic into a generic
      const downloadResult = await longRunning(`Fetching Azure Subscriptions`, async () => {

        const subscriptionPages = subscriptionClient.subscriptions
            .list()
            .byPage();

        for await (const page of subscriptionPages) {
          subs.push(...page);
        }
        return;
      });
    }

    return { succeeded: true, result: subs };
  }

  async getResourceGroups(subscriptionID: string): Promise<Errorable<ResourceGroup[]>> {
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    } 
    const rgs: ResourceGroup[] = [];
    for (const session of this.azAccount.sessions) {
      const credentials = session.credentials2;
      const resourceManagementClient: ResourceManagementClient = new ResourceManagementClient(credentials, subscriptionID);

      resourceManagementClient.resourceGroups;
      // TODO: turn this logic into a generic
      const resourceGroups = await longRunning(`Fetching Resource Groups`, async () => {
      
        const resourceGroupPages = resourceManagementClient.resourceGroups 
            .list()
            .byPage();

        for await (const page of resourceGroupPages) {
          rgs.push(...page);
        }
        return;
      });
    }

    return { succeeded: true, result: rgs };
  }

}