import {SubscriptionClient, Subscription} from '@azure/arm-subscriptions';
import {
   ResourceManagementClient,
   ResourceGroup,
   GenericResource
} from '@azure/arm-resources';
import {PagedAsyncIterableIterator} from '@azure/core-paging';
import {
   ContainerRegistryManagementClient,
   Registry
} from '@azure/arm-containerregistry';
import {
   ContainerRegistryClient,
   ArtifactTagProperties,
   KnownContainerRegistryAudience
} from '@azure/container-registry';
import {Errorable} from './errorable';
import {TokenCredential} from '@azure/core-auth';
import {
   AccessPolicyEntry,
   KeyVaultManagementClient,
   Vault,
   VaultAccessPolicyParameters
} from '@azure/arm-keyvault';
import {
   CertificateClient,
   CertificatePolicy,
   CertificateProperties,
   KeyVaultCertificateWithPolicy
} from '@azure/keyvault-certificates';
import {DefaultAzureCredential} from '@azure/identity';
import {DnsManagementClient, Zone} from '@azure/arm-dns';
import {timeout} from './timeout';
import {
   ContainerServiceClient,
   ContainerServiceClientOptionalParams,
   ManagedCluster
} from '@azure/arm-containerservice';
import {parseAzureResourceId} from '@microsoft/vscode-azext-azureutils';
import {AuthorizationManagementClient} from '@azure/arm-authorization';
import {RoleAssignment} from '@azure/arm-authorization/esm/models';
import 'cross-fetch/polyfill';
import {Client as GraphClient} from '@microsoft/microsoft-graph-client';
import {TokenCredentialAuthenticationProvider} from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const CREATE_CERT_TIMEOUT = 300_000;
const LATEST_ARM_RESOURCE_VERSION = '2022-01-31-PREVIEW';

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
      registryItem: RegistryItem
   ): Promise<Errorable<RepositoryItem[]>>;
   listRepositoryTags(
      registryItem: RegistryItem,
      repositoryItem: RepositoryItem
   ): Promise<Errorable<TagItem[]>>;
   listKeyVaults(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<KeyVaultItem[]>>;
   listCertificates(
      keyVaultItem: KeyVaultItem
   ): Promise<Errorable<CertificateItem[]>>;
   listDnsZones(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<DnsZoneItem[]>>;
   createCertificate(
      keyVaultItem: KeyVaultItem,
      name: string,
      policy: CertificatePolicy
   ): Promise<Errorable<KeyVaultCertificateWithPolicy>>;
   listAksClusters(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<ManagedClusterItem[]>>;
   createOrUpdateAksCluster(
      managedClusterItem: ManagedClusterItem,
      opts?: ContainerServiceClientOptionalParams
   ): Promise<Errorable<ManagedClusterItem>>;
   createRoleAssignment(
      subscriptionItem: SubscriptionItem,
      role: {name: string; id: string},
      assignee: string,
      scope: string
   ): Promise<Errorable<RoleAssignmentItem>>;
   getResource(
      subscriptionItem: SubscriptionItem,
      resourceId: string
   ): Promise<Errorable<ResourceItem>>;
   addKeyVaultPolicy(
      keyVaultItem: KeyVaultItem,
      ...accessPolicies: AccessPolicyEntry[]
   ): Promise<Errorable<VaultAccessPolicyItem>>;
   getADAppByName(name: string): Promise<Errorable<ADAppItem[]>>;
}

export interface SubscriptionItem {
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

export interface DnsZoneItem {
   dnsZone: Zone;
}

export interface ManagedClusterItem {
   managedCluster: ManagedCluster;
}

export interface RoleAssignmentItem {
   roleAssignment: RoleAssignment;
}

export interface ResourceItem {
   resource: GenericResource;
}

export interface VaultAccessPolicyItem {
   policy: VaultAccessPolicyParameters;
}

export interface ADAppItem {
   id: string;
   displayName: string;
}

type CredGetter = () => TokenCredential;

export class Az implements AzApi {
   constructor(private getCreds: CredGetter) {}

   async listSubscriptions(): Promise<Errorable<SubscriptionItem[]>> {
      try {
         const creds = this.getCreds();
         const subClient = new SubscriptionClient(creds);
         const subs = await listAll(subClient.subscriptions.list());
         const subItems = subs.map((subscription) => ({
            subscription
         }));
         return {succeeded: true, result: subItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list subscriptions: ${error}`
         };
      }
   }

   async listResourceGroups(
      subscriptionItem: SubscriptionItem
   ): Promise<Errorable<ResourceGroupItem[]>> {
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }

      try {
         const creds = this.getCreds();
         const resourceGroupClient = new ResourceManagementClient(
            creds,
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
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resourceGroup name undefined'};
      }

      try {
         const creds = this.getCreds();
         const registryManagementClient = new ContainerRegistryManagementClient(
            creds,
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
      registryItem: RegistryItem
   ): Promise<Errorable<RepositoryItem[]>> {
      const loginServer = registryItem.registry.loginServer;
      if (typeof loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      try {
         const location = registryItem.registry.location;
         const audience = audienceFromLocation(location);
         const creds = this.getCreds();
         const registryClient = this.getContainerRegistryClient(
            creds,
            loginServer,
            audience
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
      registryItem: RegistryItem,
      repositoryItem: RepositoryItem
   ): Promise<Errorable<TagItem[]>> {
      const loginServer = registryItem.registry.loginServer;
      if (typeof loginServer === 'undefined') {
         return {succeeded: false, error: 'registry login server undefined'};
      }

      try {
         const location = registryItem.registry.location;
         const audience = audienceFromLocation(location);
         const creds = this.getCreds();
         const registryClient = this.getContainerRegistryClient(
            creds,
            loginServer,
            audience
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
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resourceGroup name undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new KeyVaultManagementClient(creds, subscriptionId);
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

   async getGraphClient(): Promise<Errorable<GraphClient>> {
      const cred = this.getCreds();

      // get app's access token scoped to Microsoft Graph
      const tokenResponse = await cred.getToken(
         'https://graph.microsoft.com/.default'
      );
      if (tokenResponse === null) {
         return {
            succeeded: false,
            error: `Failed to get token for Microsoft Graph`
         };
      }

      // {scopes: ['Application.Read.All']}
      const graphClient = GraphClient.init({
         authProvider: (done) => {
            done(null, tokenResponse.token);
         }
      });
      return {succeeded: true, result: graphClient};
   }

   async getADAppByName(name: string): Promise<Errorable<ADAppItem[]>> {
      if (typeof name === 'undefined') {
         return {succeeded: false, error: 'name undefined'};
      }

      const getGraphClientResult = await this.getGraphClient();
      if (!getGraphClientResult.succeeded) {
         return {
            succeeded: false,
            error: `Failed to get graph client ${getGraphClientResult.error}`
         };
      }
      const graphClient = getGraphClientResult.result;

      try {
         const resp = await graphClient
            .api(`https://graph.microsoft.com/v1.0/applications`)
            // .header('ConsistencyLevel', 'eventual')
            .filter(encodeURIComponent(`displayName eq '${name}'`))
            .top(1)
            .get();

         const applications: ADAppItem[] = resp.value;

         return {succeeded: true, result: applications};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list AD Apps for subscription ${error}`
         };
      }
   }

   async addKeyVaultPolicy(
      keyVaultItem: KeyVaultItem,
      ...accessPolicies: AccessPolicyEntry[]
   ): Promise<Errorable<VaultAccessPolicyItem>> {
      const id = keyVaultItem.vault.id;
      if (id === undefined) {
         return {succeeded: false, error: 'Subscription id undefined'};
      }

      try {
         const {subscriptionId, resourceGroup, resourceName} =
            parseAzureResourceId(id);
         const creds = this.getCreds();
         const client = new KeyVaultManagementClient(creds, subscriptionId);
         const resp = await client.vaults.updateAccessPolicy(
            resourceGroup,
            resourceName,
            'add',
            {
               properties: {accessPolicies}
            }
         );
         return {succeeded: true, result: {policy: resp}};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to add key vault policies to "${id}": ${error}`
         };
      }
   }

   async listDnsZones(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<DnsZoneItem[]>> {
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resource group name undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new DnsManagementClient(creds, subscriptionId);
         const zones = await listAll(
            client.zones.listByResourceGroup(resourceGroupName)
         );
         const zoneItems: DnsZoneItem[] = zones.map((zone) => ({
            dnsZone: zone
         }));
         return {succeeded: true, result: zoneItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list DNS zones for subscription "${subscriptionId}" and resource group "${resourceGroupName}": ${error}`
         };
      }
   }

   async listCertificates(
      keyVaultItem: KeyVaultItem
   ): Promise<Errorable<CertificateItem[]>> {
      const vaultUri = keyVaultItem.vault.properties.vaultUri;
      if (vaultUri === undefined) {
         return {succeeded: false, error: 'vault URI undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new CertificateClient(vaultUri, creds);
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

   async createCertificate(
      keyVaultItem: KeyVaultItem,
      name: string,
      policy: CertificatePolicy
   ): Promise<Errorable<KeyVaultCertificateWithPolicy>> {
      const vaultUri = keyVaultItem.vault.properties.vaultUri;
      if (vaultUri === undefined) {
         return {succeeded: false, error: 'vault URI undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new CertificateClient(vaultUri, creds);
         const poller = await client.beginCreateCertificate(name, policy);
         return {
            succeeded: true,
            result: await timeout(CREATE_CERT_TIMEOUT, poller.pollUntilDone())
         };
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to create or update certificate for key vault "${keyVaultItem.vault.name}": ${error}`
         };
      }
   }

   async listAksClusters(
      subscriptionItem: SubscriptionItem,
      resourceGroupItem: ResourceGroupItem
   ): Promise<Errorable<ManagedClusterItem[]>> {
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (typeof subscriptionId === 'undefined') {
         return {succeeded: false, error: 'subscriptionId undefined'};
      }
      const resourceGroupName = resourceGroupItem.resourceGroup.name;
      if (typeof resourceGroupName === 'undefined') {
         return {succeeded: false, error: 'resource group name undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new ContainerServiceClient(creds, subscriptionId);
         const clusters = await listAll(
            client.managedClusters.listByResourceGroup(resourceGroupName)
         );
         const clusterItems: ManagedClusterItem[] = clusters.map((cluster) => ({
            managedCluster: cluster
         }));
         return {succeeded: true, result: clusterItems};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list AKS clusters for subscription "${subscriptionId}" and resource group "${resourceGroupName}": ${error}`
         };
      }
   }

   async createOrUpdateAksCluster(
      managedClusterItem: ManagedClusterItem,
      opts?: ContainerServiceClientOptionalParams
   ): Promise<Errorable<ManagedClusterItem>> {
      const id = managedClusterItem.managedCluster.id;
      if (id === undefined) {
         throw Error('managed cluster id is undefined');
      }

      const {subscriptionId, resourceGroup, resourceName} =
         parseAzureResourceId(id);
      try {
         const creds = this.getCreds();
         const client = new ContainerServiceClient(creds, subscriptionId, opts);
         const managedCluster =
            await client.managedClusters.beginCreateOrUpdateAndWait(
               resourceGroup,
               resourceName,
               managedClusterItem.managedCluster
            );
         return {succeeded: true, result: {managedCluster}};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to update AKS cluster "${managedClusterItem.managedCluster.name}": ${error}`
         };
      }
   }

   async createRoleAssignment(
      subscriptionItem: SubscriptionItem,
      role: {name: string; id: string},
      assignee: string,
      scope: string
   ): Promise<Errorable<RoleAssignmentItem>> {
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (subscriptionId === undefined) {
         return {succeeded: false, error: 'SubscriptionId undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new AuthorizationManagementClient(
            creds,
            subscriptionId
         );
         const resp = await client.roleAssignments.create(scope, role.name, {
            principalId: assignee,
            roleDefinitionId: role.id
         });
         return {succeeded: true, result: {roleAssignment: resp}};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to create role assignment: ${error}`
         };
      }
   }

   async getResource(
      subscriptionItem: SubscriptionItem,
      resourceId: string
   ): Promise<Errorable<ResourceItem>> {
      const subscriptionId = subscriptionItem.subscription.subscriptionId;
      if (subscriptionId === undefined) {
         return {succeeded: false, error: 'SubscriptionId undefined'};
      }

      try {
         const creds = this.getCreds();
         const client = new ResourceManagementClient(creds, subscriptionId);
         const resource = await client.resources.getById(
            resourceId,
            LATEST_ARM_RESOURCE_VERSION
         );
         return {succeeded: true, result: {resource}};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to get resource "${resourceId}": ${error}`
         };
      }
   }

   private getContainerRegistryClient(
      creds: TokenCredential,
      loginServer: string,
      audience: KnownContainerRegistryAudience
   ): ContainerRegistryClient {
      return new ContainerRegistryClient(`https://${loginServer}`, creds, {
         audience
      });
   }
}

// Ideally we'd use the Azure Account Extension to authenticate but there's major bugs with it right now
// https://github.com/Azure/azure-sdk-for-js/issues/22904
export const getAzCreds: CredGetter = () => new DefaultAzureCredential();

export async function listAll<T>(
   iterator: PagedAsyncIterableIterator<T>
): Promise<T[]> {
   const all: T[] = [];
   for await (const page of iterator.byPage()) {
      all.push(...page);
   }
   return all;
}

export function audienceFromLocation(
   location: string
): KnownContainerRegistryAudience {
   const lowercased = location.toLowerCase();

   if (lowercased.startsWith('china')) {
      return KnownContainerRegistryAudience.AzureResourceManagerChina;
   }
   if (lowercased.startsWith('germany')) {
      return KnownContainerRegistryAudience.AzureResourceManagerGermany;
   }
   if (lowercased.startsWith('usgov')) {
      return KnownContainerRegistryAudience.AzureResourceManagerGovernment;
   }

   // list of locations https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/regionalAuthority.ts
   return KnownContainerRegistryAudience.AzureResourceManagerPublicCloud;
}
