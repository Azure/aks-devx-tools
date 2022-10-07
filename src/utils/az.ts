import { AzureAccountExtensionApi } from "./azAccount";
import { commands, window, workspace } from "vscode";
import { Errorable, failed, Failed, succeeded } from "./errorable";
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { longRunning } from "./host";
import { ResourceManagementClient, ResourceGroup } from "@azure/arm-resources";
import {
  ContainerRegistryManagementClient,
  Registry,
} from "@azure/arm-containerregistry";
import {
  ContainerServiceClient,
  CredentialResult,
  ManagedCluster,
} from "@azure/arm-containerservice";
import { resourceLimits } from "worker_threads";
import { KeyVaultManagementClient, Vault } from "@azure/arm-keyvault";
import {
  CertificateClient,
  CertificateProperties,
} from "@azure/keyvault-certificates";

export interface AzApi {
  getSubscriptions(): Promise<Errorable<Subscription[]>>;
  getResourceGroups(
    ...subscriptionIDs: string[]
  ): Promise<Errorable<ResourceGroup[]>>;
  getAcrs(
    subscriptionId: string,
    resourceGroupId: string
  ): Promise<Errorable<Registry[]>>;
  getAcrsFromSub(subscriptionId: string): Promise<Errorable<Registry[]>>;
  getAksClusterNames(
    subscriptionId: string,
    resourceGroupName: string
  ): Promise<Errorable<ManagedCluster[]>>;
  getAksAdminCreds(
    subscriptionId: string,
    resourceGroupName: string,
    desiredClusterName: string
  ): Promise<Errorable<boolean>>;
  getKeyVaults(
    subscriptionId: string,
    resourceGroup: string
  ): Promise<Errorable<Vault[]>>;
  parseId(id: string): {
    subscription: string | undefined;
    resourceGroup: string | undefined;
  };
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

    const finalSubs = await Promise.all(subs);

    if (finalSubs.length === 0) {
      return {
        succeeded: false,
        error:
          "No subscriptions were found. Please select subscriptions using Azure Account VSCode extension.",
      };
    }

    return { succeeded: true, result: finalSubs };
  }

  async getResourceGroups(
    ...subscriptionIDs: string[]
  ): Promise<Errorable<ResourceGroup[]>> {
    if (subscriptionIDs.length === 0) {
      return {
        succeeded: false,
        error: "no subscriptions were provided to getResourceGroups",
      } as Failed;
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

  async getAcrsFromSub(subscriptionId: string): Promise<Errorable<Registry[]>> {
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
        const pages = client.registries.list().byPage();
        for await (const page of pages) acrs.push(...page);
      });
    }

    return { succeeded: true, result: acrs };
  }

  async getAcrs(
    subscriptionId: string,
    resourceGroupName: string
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
          .listByResourceGroup(resourceGroupName)
          .byPage();
        for await (const page of pages) acrs.push(...page);
      });
    }

    return { succeeded: true, result: acrs };
  }

  async getAksClusterNames(
    subscriptionId: string,
    resourceGroupName: string
  ): Promise<Errorable<ManagedCluster[]>> {
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    }

    const clusters: ManagedCluster[] = [];
    for (const session of this.azAccount.sessions) {
      const client = new ContainerServiceClient(
        session.credentials2,
        subscriptionId
      );
      for await (const item of client.managedClusters
        .listByResourceGroup(resourceGroupName)
        .byPage()) {
        clusters.push(...item);
      }
    }
    return { succeeded: true, result: clusters };
  }

  async getAksAdminCreds(
    subscriptionId: string,
    resourceGroupName: string,
    desiredClusterName: string
  ): Promise<Errorable<boolean>> {
    const clusters: ManagedCluster[] = [];
    let toReturn: Errorable<boolean> = { succeeded: true, result: true };
    let foundAdmin = false;
    let error: Error;

    for (const session of this.azAccount.sessions) {
      const client = new ContainerServiceClient(
        session.credentials2,
        subscriptionId
      );
      const credsPromise = client.managedClusters.listClusterAdminCredentials(
        resourceGroupName,
        desiredClusterName
      );

      await credsPromise
        .then((output) => {
          // if creds of any session have admin access, assume GitHub does too
          toReturn = { succeeded: true, result: true };
          foundAdmin = true;
        })
        .catch((error: Error) => {
          if (
            error.message.startsWith(
              "Getting static credential is not allowed because this cluster is set to disable local accounts"
            )
          ) {
            toReturn = { succeeded: true, result: false };
          } else {
            toReturn = { succeeded: false, error: error.message };
          }
        });

      if (foundAdmin) {
        break;
      }
    }
    return toReturn;
  }

  async getKeyVaults(
    subscriptionId: string,
    resourceGroup: string
  ): Promise<Errorable<Vault[]>> {
    const loginResult = await this.checkLoginAndFilters();
    if (!loginResult.succeeded) {
      return loginResult;
    }

    const vaults: Vault[] = [];

    for (const session of this.azAccount.sessions) {
      const creds = session.credentials2;
      const client = new KeyVaultManagementClient(creds, subscriptionId);

      const pages = client.vaults.listByResourceGroup(resourceGroup).byPage();
      for await (const page of pages) vaults.push(...page);
    }

    return { succeeded: true, result: vaults };
  }

  parseId(id: string): {
    subscription: string | undefined;
    resourceGroup: string | undefined;
  } {
    const re =
      /subscriptions\/(?<subscription>.+)\/resourceGroups\/(?<resourceGroup>.+)\/providers\/(.+?)\/(.+?)\/(.+)/i;
    const matches = id.match(re)?.groups;
    return {
      subscription: matches?.subscription,
      resourceGroup: matches?.resourceGroup,
    };
  }
}
