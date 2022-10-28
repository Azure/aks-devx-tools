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
}

interface SubscriptionItem {
   session: AzureSession;
   subscription: Subscription;
}

interface ResourceGroupItem {
   resourceGroup: ResourceGroup;
}

interface RegistryItem {
   registry: Registry;
}

interface RepositoryItem {
   repositoryName: string;
}

interface TagItem {
   tag: ArtifactTagProperties;
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

      if (typeof subscriptionItem.subscription.subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      const resourceGroupClient = new ResourceManagementClient(
         credentials2,
         subscriptionItem.subscription.subscriptionId
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
   }

   async listContainerRegistries(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<RegistryItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      if (typeof subscriptionItem.subscription.subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      if (typeof resourceGroupItem.resourceGroup.name === 'undefined') {
         return {succeeded: false, error: 'resourceGroup name undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      const registryManagementClient = new ContainerRegistryManagementClient(
         credentials2,
         subscriptionItem.subscription.subscriptionId
      );
      const registries = await listAll(
         registryManagementClient.registries.listByResourceGroup(
            resourceGroupItem.resourceGroup.name
         )
      );
      const registryItem: RegistryItem[] = registries.map((registry) => ({
         registry
      }));
      return {succeeded: true, result: registryItem};
   }

   async listRegistryRepositories(
      subscriptionItem: SubscriptionItem,
      registryItem: RegistryItem
   ): Promise<Errorable<RepositoryItem[]>> {
      const loginResult = await this.checkLoginAndFilters();
      if (!loginResult.succeeded) {
         return loginResult;
      }

      if (typeof registryItem.registry.loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      const registryClient = new ContainerRegistryClient(
         registryItem.registry.loginServer,
         credentials2
      );
      const repositories = await listAll(registryClient.listRepositoryNames());
      const repositoryItems: RepositoryItem[] = repositories.map(
         (repository) => ({
            repositoryName: repository
         })
      );
      return {succeeded: true, result: repositoryItems};
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

      if (typeof registryItem.registry.loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      const {credentials2} = subscriptionItem.session;
      const registryClient = new ContainerRegistryClient(
         registryItem.registry.loginServer,
         credentials2
      );
      const tags = await listAll(
         registryClient
            .getArtifact(repositoryItem.repositoryName, '') // the second parameter is a tag or digest which makes this a weird but correct usage pattern
            .listTagProperties()
      );
      const tagItems: TagItem[] = tags.map((tag) => ({
         tag: tag
      }));
      return {succeeded: true, result: tagItems};
   }
}

export function getAzureAccount(): AzureAccountExtensionApi {
   return (<AzureExtensionApiProvider>(
      vscode.extensions.getExtension('ms-vscode.azure-account')!.exports
   )).getApi('1.0.0');
}

async function listAll<T>(
   iterator: PagedAsyncIterableIterator<T>
): Promise<T[]> {
   const all: T[] = [];
   for await (const page of iterator.byPage()) {
      all.push(...page);
   }
   return all;
}
