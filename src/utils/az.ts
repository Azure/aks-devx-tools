import {AzureAccountExtensionApi, AzureSession} from './azureAccount.api';
import type {AzureExtensionApiProvider} from '@microsoft/vscode-azext-utils/api';
import {SubscriptionClient, Subscription} from '@azure/arm-subscriptions';
import {ResourceManagementClient, ResourceGroup} from '@azure/arm-resources';
import {PagedAsyncIterableIterator} from '@azure/core-paging';
import * as vscode from 'vscode';
import {Errorable} from './errorable';

export interface AzApi {}

interface SubscriptionItem {
   label: string;
   description: string;
   session: AzureSession;
   subscription: Subscription;
}

interface ResourceGroupItem {
   label: string;
   description: string;
   resourceGroup: ResourceGroup;
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
