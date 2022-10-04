import { AzureAccountExtensionApi } from "./azAccount";
import { commands, window, workspace } from "vscode";
import { Errorable, succeeded } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { longRunning } from "./host";
import { ResourceManagementClient, ResourceGroup } from "@azure/arm-resources";
import {
  ContainerRegistryManagementClient,
  Registry,
} from "@azure/arm-containerregistry";
import {
  ContainerServiceClient,
  ManagedCluster,
} from "@azure/arm-containerservice";

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
  getResourceGroups(
    ...subscriptionIds: string[]
  ): Promise<Errorable<ResourceGroup[]>>;
  getAcrs(
    subscriptionId: string,
    resourceGroupId: string
  ): Promise<Errorable<Registry[]>>;
  getAcrRegistriesByResourceGroup(
    resourceGroup: ResourceGroup,
    subscription: Subscription
  ): Promise<Errorable<Registry[]>>;
  getAksClusterNames(
    subscription: Subscription,
    resourceGroup: ResourceGroup
  ): Promise<Errorable<ManagedCluster[]>>;
}

// TODO: add any needed az interactions
// use subscription fn and https://github.com/microsoft/vscode-azure-account/blob/main/sample/src/extension.ts
// as reference. Note that things like resource groups will take a subscription as a parameter like the linked example
export class Az implements AzApi {
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
    const azureConfig = workspace.getConfiguration("azure"); // from https://github.com/microsoft/vscode-azure-account/blob/de70d0b194727cc30b6f2f15f71678ea552640a4/src/login/commands/selectSubscriptions.ts#L28
    const resourceFilter: string[] = (
      azureConfig.get<string[]>("resourceFilter") || ["all"]
    ).slice();

    const selectedSubs = resourceFilter.map(
      (subString) => subString.split("/")[1]
    );

    const subs: Promise<Subscription>[] = [];
    for (const session of this.azAccount.sessions) {
      const credentials = session.credentials2;
      const subscriptionClient = new SubscriptionClient(credentials);

      // TODO: turn this logic into a generic
      await longRunning(`Fetching Azure Subscriptions`, async () => {
        for (const selectedSub of selectedSubs) {
          subs.push(subscriptionClient.subscriptions.get(selectedSub));
        }
        return;
      });
    }
    return { succeeded: true, result: await Promise.all(subs) };
  }

  async getResourceGroups(
    ...subscriptionIDs: string[]
  ): Promise<Errorable<ResourceGroup[]>> {
    if (subscriptionIDs.length === 0) {
      const subs = await this.getSubscriptions();
      if (succeeded(subs)) {
        subscriptionIDs = subs.result.map(
          (sub) => sub.subscriptionId as string
        );
      } else {
        window.showErrorMessage(
          "Failed to retrieve Azure subscriptions:",
          subs.error
        );
      }
    }
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    }
    const rgs: ResourceGroup[] = [];
    for (const session of this.azAccount.sessions) {
      const credentials = session.credentials2;

      // TODO: turn this logic into a generic
      await longRunning(`Fetching Resource Groups`, async () => {
        for (const subscriptionId of subscriptionIDs) {
          const resourceManagementClient: ResourceManagementClient =
            new ResourceManagementClient(credentials, subscriptionId);

          const resourceGroupPages = resourceManagementClient.resourceGroups
            .list()
            .byPage();

          for await (const page of resourceGroupPages) {
            rgs.push(...page);
          }
        }
      });
    }

    return { succeeded: true, result: rgs };
  }

  async getAcrs(
    subscriptionId: string,
    resourceGroupId: string
  ): Promise<Errorable<Registry[]>> {
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    }

    const acrs: Registry[] = [];
    for (const session of this.azAccount.sessions) {
      const creds = session.credentials2;
      const client = new ContainerRegistryManagementClient(
        creds,
        subscriptionId
      );

      await longRunning("Fetching ACRs", async () => {
        const pages = client.registries
          .listByResourceGroup(resourceGroupId)
          .byPage();
        for await (const page of pages) acrs.push(...page);
      });
    }

    return { succeeded: true, result: acrs };
  }

  //this method considers getSubscriptions() and getResourceGroups() are called first
  async getAksClusterNames(
    subscription: Subscription,
    resourceGroup: ResourceGroup
  ): Promise<Errorable<ManagedCluster[]>> {
    const clusters: ManagedCluster[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerServiceClient(
        session.credentials2,
        subscription.subscriptionId!
      );
      for await (const item of client.managedClusters
        .listByResourceGroup(resourceGroup.name!)
        .byPage()) {
        clusters.push(...item);
      }
    }
    return { succeeded: true, result: clusters };
  }

  async getAcrRegistriesByResourceGroup(
    resourceGroup: ResourceGroup,
    subscription: Subscription
  ): Promise<Errorable<Registry[]>> {
    const registries: Registry[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerRegistryManagementClient(
        session.credentials2,
        subscription.subscriptionId!
      );
      const items = client.registries.listByResourceGroup(resourceGroup.name!);
      for await (const item of items) {
        registries.push(item);
      }
    }
    return { succeeded: true, result: registries };
  }
}
