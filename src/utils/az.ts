import {AzureAccountExtensionApi, AzureSession} from './azureAccount.api';
import type {AzureExtensionApiProvider} from '@microsoft/vscode-azext-utils/api';
import {SubscriptionClient, Subscription} from '@azure/arm-subscriptions';
import {ResourceManagementClient, ResourceGroup} from '@azure/arm-resources';
import {PagedAsyncIterableIterator} from '@azure/core-paging';
import {
   ContainerRegistryManagementClient,
   Registry
} from '@azure/arm-containerregistry';
import {
   ContainerRegistryClient,
   ArtifactTagProperties
} from '@azure/container-registry';
import * as vscode from 'vscode';
import {Errorable} from './errorable';
import {TokenCredential} from '@azure/core-auth';
import {Environment} from '@azure/ms-rest-azure-env';
import {KeyVaultManagementClient, Vault} from '@azure/arm-keyvault';
import {
   CertificateClient,
   CertificateProperties
} from '@azure/keyvault-certificates';
import {DefaultAzureCredential} from '@azure/identity';

export interface AzApi {
   listSubscriptions(): Promise<Errorable<SubscriptionItem[]>>;
   listResourceGroups(
      subscriptionItem: SubscriptionItem
   ): Promise<Errorable<ResourceGroupItem[]>>;
   listContainerRegistries(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<RegistryItem[]>>;
   listRegistryRepositories(
      subscriptionItem: SubscriptionItem,
      registryItem: RegistryItem
   ): Promise<Errorable<RepositoryItem[]>>;
   listRepositoryTags(
      subscriptionItem: SubscriptionItem,
      registryItem: RegistryItem,
      repositoryItem: RepositoryItem
   ): Promise<Errorable<TagItem[]>>;
   listKeyVaults(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<KeyVaultItem[]>>;
   listCertificates(
      subscriptionItem: SubscriptionItem,
      keyVaultItem: KeyVaultItem
   ): Promise<Errorable<CertificateItem[]>>;
}

export interface SubscriptionItem {
   session: AzureSession;
   subscription: Subscription;
}

export interface ResourceGroupItem {
   resourceGroup: ResourceGroup;
}

export interface RegistryItem {
   registry: Registry;
}

export interface RepositoryItem {
   repositoryName: string;
}

export interface TagItem {
   tag: ArtifactTagProperties;
}

export interface KeyVaultItem {
   vault: Vault;
}

export interface CertificateItem {
   certificate: CertificateProperties;
}

export class Az implements AzApi {
   constructor(private azAccount: AzureAccountExtensionApi) {}

   private async checkLoginAndFilters(): Promise<Errorable<void>> {
      if (!(await this.azAccount.waitForLogin())) {
         vscode.commands.executeCommand('azure-account.askForLogin');
         return {succeeded: false, error: 'failed to login'};
      }

      await this.azAccount.waitForFilters();
      return {succeeded: true, result: undefined};
   }

   async listSubscriptions(): Promise<Errorable<SubscriptionItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const subscriptionItems: SubscriptionItem[] = [];
      for (const session of this.azAccount.sessions) {
         try {
            const subClient = new SubscriptionClient(session.credentials2);
            const sessionSubscriptions = await listAll(
               subClient.subscriptions.list()
            );
            subscriptionItems.push(
               ...sessionSubscriptions.map((subscription) => ({
                  session,
                  subscription
               }))
            );
         } catch (error) {
            // we don't want to fail if only one session is failing to list.
            // there could be incorrect credentials for that session
            console.error(`Failed to list subscriptions for a session`);
         }
      }

      return {succeeded: true, result: subscriptionItems};
   }

   async listResourceGroups(
      subscriptionItem: SubscriptionItem
   ): Promise<Errorable<ResourceGroupItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      try {
         const resourceGroupClient = new ResourceManagementClient(
            credentials2,
            subscriptionId
         );
         const resourceGroups = await listAll(
            resourceGroupClient.resourceGroups.list()
         );

         const resourceGroupItems: ResourceGroupItem[] = resourceGroups.map(
            (resourceGroup) => ({
               resourceGroup
            })
         );
         return {succeeded: true, result: resourceGroupItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list resource groups for subscription "${subscriptionId}": ${error}`
         };
      }
   }

   async listContainerRegistries(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<RegistryItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resourceGroup name undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      try {
         const registryManagementClient = new ContainerRegistryManagementClient(
            credentials2,
            subscriptionId
         );
         const registries = await listAll(
            registryManagementClient.registries.listByResourceGroup(
               resourceGroupName
            )
         );
         const registryItem: RegistryItem[] = registries.map((registry) => ({
            registry
         }));
         return {succeeded: true, result: registryItem};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list registries for subscription "${subscriptionId}" and resource group "${resourceGroupName}": ${error}`
         };
      }
   }

   async listRegistryRepositories(
      subscriptionItem: SubscriptionItem,
      registryItem: RegistryItem
   ): Promise<Errorable<RepositoryItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const loginServer = registryItem.registry.loginServer;
      if (typeof loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      const {credentials2, environment} = subscriptionItem.session;
      try {
         const registryClient = this.getContainerRegistryClient(
            credentials2,
            loginServer,
            environment
         );
         const repositories = await listAll(
            registryClient.listRepositoryNames()
         );
         const repositoryItems: RepositoryItem[] = repositories.map(
            (repository) => ({
               repositoryName: repository
            })
         );
         return {succeeded: true, result: repositoryItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list registry repositories: ${error}`
         };
      }
   }

   async listRepositoryTags(
      subscriptionItem: SubscriptionItem,
      registryItem: RegistryItem,
      repositoryItem: RepositoryItem
   ): Promise<Errorable<TagItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const loginServer = registryItem.registry.loginServer;
      if (typeof loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      const {credentials2, environment} = subscriptionItem.session;
      try {
         const registryClient = this.getContainerRegistryClient(
            credentials2,
            loginServer,
            environment
         );
         const tags = await listAll(
            registryClient
               .getArtifact(repositoryItem.repositoryName, 'latest') // the second parameter is a tag or digest which makes this a weird but correct usage pattern
               .listTagProperties()
         );
         const tagItems: TagItem[] = tags.map((tag) => ({
            tag: tag
         }));
         return {succeeded: true, result: tagItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list repository tags: ${error}`
         };
      }
   }

   async listKeyVaults(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<KeyVaultItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resourceGroup name undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      try {
         const client = new KeyVaultManagementClient(
            credentials2,
            subscriptionId
         );
         const vaults = await listAll(
            client.vaults.listByResourceGroup(resourceGroupName)
         );
         const vaultItems: KeyVaultItem[] = vaults.map((vault) => ({vault}));
         return {succeeded: true, result: vaultItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list key vaults for subscription "${subscriptionId}" and resource group "${resourceGroupName}": ${error}`
         };
      }
   }

   async listCertificates(
      subscriptionItem: SubscriptionItem,
      keyVaultItem: KeyVaultItem
   ): Promise<Errorable<CertificateItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      const vaultUri = keyVaultItem.vault.properties.vaultUri;
      if (vaultUri === undefined) {
         return {succeeded: false, error: 'vault URI undefined'};
      }

      let {credentials2} = subscriptionItem.session;
      const credential = new DefaultAzureCredential({});
      try {
         const client = new CertificateClient(vaultUri, credential);
         const certs = await listAll(
            client.listPropertiesOfCertificates({includePending: true})
         );
         const certItems: CertificateItem[] = certs.map((certificate) => ({
            certificate
         }));
         return {succeeded: true, result: certItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list certificates for key vault "${keyVaultItem.vault.name}": ${error}`
         };
      }
   }

   private getContainerRegistryClient(
      creds: TokenCredential,
      loginServer: string,
      environment: Environment
   ): ContainerRegistryClient {
      // @azure/container-registry doesn't support ADAL tokens at all and will error without this
      // https://github.com/Azure/azure-sdk-for-js/issues/21192
      (creds as any).signRequest = undefined;

      return new ContainerRegistryClient(`https://${loginServer}`, creds, {
         audience: environment.resourceManagerEndpointUrl
      });
   }
}

export function getAzureAccount(): AzureAccountExtensionApi {
   return (<AzureExtensionApiProvider>(
      vscode.extensions.getExtension('ms-vscode.azure-account')!.exports
   )).getApi('1.0.0');
}

export async function listAll<T>(
   iterator: PagedAsyncIterableIterator<T>
): Promise<T[]> {
   const all: T[] = [];
   for await (const page of iterator.byPage()) {
      all.push(...page);
   }
   return all;
}
