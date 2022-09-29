import { AzureAccountExtensionApi } from "./azAccount";
import { commands } from "vscode";
import { Errorable } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { ResourceManagementClient, ResourceGroup } from '@azure/arm-resources';
import { ManagedCluster, ContainerServiceClient } from '@azure/arm-containerservice';
import { ContainerRegistryClient, KnownContainerRegistryAudience } from '@azure/container-registry';

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
  getResourceGroups(subscription: Subscription): Promise<Errorable<ResourceGroup[]>>;
  getAksClusterNames(subscription: Subscription): Promise<Errorable<ManagedCluster[]>>;
  getAcrRegistries(subscription: Subscription): Promise<Errorable<Array<string>>>;
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
  async getAksClusterNames(subscription: Subscription): Promise<Errorable<ManagedCluster[]>> {
    const clusters: ManagedCluster[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerServiceClient(session.credentials2, subscription.subscriptionId!);
      for await (const item of client.managedClusters.list().byPage()) {
        clusters.push(...item);
      }
    }
    return { succeeded: true, result: clusters };
  }

  async getAcrRegistries(endpoint: string): Promise<Errorable<Array<string>>> {
    // endpoint should be in the form of "https://myregistryname.azurecr.io"
    // where "myregistryname" is the actual name of your registry
    let repositoryLists = new Array();
    for (const session of this.azAccount.sessions) {
      const client = new ContainerRegistryClient(endpoint, session.credentials2, {
        audience: KnownContainerRegistryAudience.AzureResourceManagerPublicCloud
      });
      const iterator = client.listRepositoryNames();
      for await (const repository of iterator) {
        repositoryLists.push(repository);
      }
      // if needed write methods to get artifact names by tagName
      // Obtain a RegistryArtifact object to get access to image operations
      // const image = client.getArtifact("library/hello-world", "latest");

      // List the set of tags on the hello_world image tagged as "latest"
      // const tagIterator = image.listTagProperties();

      // Iterate through the image's tags, listing the tagged alias for the image
      // console.log(`${image.fullyQualifiedReference}  has the following aliases:`);
      // for await (const tag of tagIterator) {
      //   console.log(`  ${tag.registryLoginServer}/${tag.repositoryName}:${tag.name}`);
      // }
    }

    return { succeeded: true, result: repositoryLists };
  }
}
