import { AzureAccountExtensionApi } from "./azAccount";
import { commands } from "vscode";
import { Errorable } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { ResourceManagementClient, ResourceGroup } from '@azure/arm-resources';
import { ContainerRegistryManagementClient, Registry } from '@azure/arm-containerregistry';
import { ContainerServiceClient, ManagedCluster } from '@azure/arm-containerservice';

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
  getResourceGroups(subscription: Subscription): Promise<Errorable<ResourceGroup[]>>;
  getAcrRegistriesByResourceGroup(resourceGroup: ResourceGroup, subscription: Subscription): Promise<Errorable<Registry[]>>;
  getAksClusterNames(subscription: Subscription, resourceGroup: ResourceGroup): Promise<Errorable<ManagedCluster[]>>
}

// TODO: add any needed az interactions
// use subscription fn and https://github.com/microsoft/vscode-azure-account/blob/main/sample/src/extension.ts
// as reference. Note that things like resource groups will take a subscription as a parameter like the linked example 
export class Az {
  constructor(private azAccount: AzureAccountExtensionApi) { }

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

  // this method considers getSubscriptions() is called first.
  async getResourceGroups(subscription: Subscription): Promise<Errorable<ResourceGroup[]>> {
    if (!(await this.azAccount.waitForLogin())) {
      commands.executeCommand("azure-account.askForLogin");
      return { succeeded: false, error: "failed to login" };
    }
    await this.azAccount.waitForFilters();
    const resourceGrps: ResourceGroup[] = [];
    for (const session of this.azAccount.sessions) {
      const resources = new ResourceManagementClient(session.credentials2, subscription.subscriptionId!);
      const resourceGrpPages = resources.resourceGroups.list().byPage();
      for await (const page of resourceGrpPages) {
        resourceGrps.push(...page);
      }
    }
    return { succeeded: true, result: resourceGrps };
  }

  //this method considers getSubscriptions() and getResourceGroups() are called first
  async getAksClusterNames(subscription: Subscription, resourceGroup: ResourceGroup): Promise<Errorable<ManagedCluster[]>> {
    const clusters: ManagedCluster[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerServiceClient(session.credentials2, subscription.subscriptionId!);
      for await (const item of client.managedClusters.listByResourceGroup(resourceGroup.name!).byPage()) {
        clusters.push(...item);
      }
    }
    return { succeeded: true, result: clusters };
  }

  async getAcrRegistriesByResourceGroup(resourceGroup: ResourceGroup, subscription: Subscription): Promise<Errorable<Registry[]>> {
    const registries: Registry[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerRegistryManagementClient(session.credentials2, subscription.subscriptionId!);
      const items = client.registries.listByResourceGroup(resourceGroup.name!);
      for await (const item of items) {
        registries.push(item);
      }
    }
    return { succeeded: true, result: registries };
  }
}
