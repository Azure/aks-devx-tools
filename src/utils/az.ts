import {AzureAccountExtensionApi, AzureSession} from './azureAccount.api';
import type {AzureExtensionApiProvider} from '@microsoft/vscode-azext-utils/api';
import {SubscriptionClient, Subscription} from '@azure/arm-subscriptions';
import {ResourceManagementClient, ResourceGroup} from '@azure/arm-resources';
import {PagedAsyncIterableIterator} from '@azure/core-paging';
import {
   ContainerRegistryManagementClient,
   Registry
} from '@azure/arm-containerregistry';
import {ContainerRegistryClient} from '@azure/container-registry';

import * as vscode from 'vscode';
import {Errorable} from './errorable';

export interface AzApi {}

interface Item {
   label: string;
   description: string;
}

interface SubscriptionItem extends Item {
   session: AzureSession;
   subscription: Subscription;
}

interface ResourceGroupItem extends Item {
   resourceGroup: ResourceGroup;
}

interface RegistryItem extends Item {
   registry: Registry;
}

interface RepositoryItem extends Item {
   repositoryName: string;
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
               label: subscription.displayName || '',
               description: subscription.subscriptionId || '',
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
            label: resourceGroup.name || '',
            description: resourceGroup.location,
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
         label: registry.name || '',
         description: '',
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

      if (typeof registryItem.registry.name === 'undefined') {
         return {succeeded: false, error: 'registry name undefined'};
      }
      const endpoint = `https://${registryItem.registry.name}.azurecr.io`;

      const {credentials2} = subscriptionItem.session;
      const registryClient = new ContainerRegistryClient(
         endpoint,
         credentials2
      );
      const repositories = await listAll(registryClient.listRepositoryNames());
      const repositoryItems: RepositoryItem[] = repositories.map(
         (repository) => ({
            label: repository,
            description: '',
            repositoryName: repository
         })
      );
      return {succeeded: true, result: repositoryItems};
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
