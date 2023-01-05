import {CompletedSteps} from './model/guidedExperience';
import * as vscode from 'vscode';
import {Context} from './model/context';
import {StateApi, State} from '../../utils/state';
import {longRunning} from '../../utils/host';
import {downloadDraftBinary, runDraftCommand} from './helper/runDraftHelper';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';
import {
   Az,
   AzApi,
   CertificateItem,
   DnsZoneItem,
   getAzCreds,
   KeyVaultItem,
   ManagedClusterItem,
   ResourceGroupItem,
   SubscriptionItem
} from '../../utils/az';
import {Errorable, failed, getAysncResult} from '../../utils/errorable';
import {sort} from '../../utils/sort';
import {
   ignoreFocusOut,
   PromptResourceGroup,
   PromptSubscription
} from './helper/commonPrompts';
import {getAsyncOptions} from '../../utils/quickPick';
import {ValidateRfc1123} from '../../utils/validation';
import {parseAzureResourceId} from '@microsoft/vscode-azext-azureutils';
import {
   KnownCertificatePermissions,
   KnownSecretPermissions
} from '@azure/arm-keyvault';
import {buildUpdateIngressCommand} from './helper/draftCommandBuilder';

const INGRESS_FILENAME = 'ingress.yaml';

interface PromptContext {
   outputFolder: vscode.Uri;
   tlsCertUri: string;
   useOsm: boolean;
   ingressHost: string;
   kvSubscription: SubscriptionItem;
   kvResourceGroup: ResourceGroupItem;
   kv: KeyVaultItem;
   dnsSubscription: SubscriptionItem;
   dnsResourceGroup: ResourceGroupItem;
   dns: DnsZoneItem;
   newSSLCert: boolean;
   certificate: CertificateItem;
   certificateName: string;
   aksSubscription: SubscriptionItem;
   aksResourceGroup: ResourceGroupItem;
   aks: ManagedClusterItem;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

const title = 'Draft a Kubernetes Ingress with Web App Routing';

export async function runDraftIngress(
   {actionContext, extensionContext}: Context,
   outputFolder: vscode.Uri | undefined,
   completedSteps: CompletedSteps
) {
   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   const az: AzApi = new Az(getAzCreds);

   const state: StateApi = State.construct(extensionContext);
   const deploymentPath = state.getDeploymentPath();
   if (completedSteps.draftDeployment && deploymentPath !== undefined) {
      outputFolder = vscode.Uri.file(deploymentPath);
   }

   const wizardContext: WizardContext = {
      ...actionContext,
      outputFolder: outputFolder
   };
   const promptSteps: IPromptStep[] = [
      new PromptOutputFolder(completedSteps),
      new PromptSubscription(az, 'kvSubscription', {
         placeholder: 'Key Vault Subscription',
         stepName: 'Key Vault Subscription'
      }),
      new PromptResourceGroup(az, 'kvSubscription', 'kvResourceGroup', {
         placeholder: 'Key Vault Resource Group',
         stepName: 'Key Vault Resource Group'
      }),
      new PromptKv(az),
      new PromptNewSslCert(),
      new PromptCertName(),
      new PromptCertificate(az),
      new PromptSubscription(az, 'dnsSubscription', {
         placeholder: 'DNS Zone Subscription',
         stepName: 'DNS Zone Subscription'
      }),
      new PromptResourceGroup(az, 'dnsSubscription', 'dnsResourceGroup', {
         placeholder: 'DNS Zone Resource Group',
         stepName: 'DNS Zone Resource Group'
      }),
      new PromptDnsZone(az),
      new PromptSubscription(az, 'aksSubscription', {
         placeholder: 'AKS Cluster Subscription',
         stepName: 'AKS Cluster Subscription'
      }),
      new PromptResourceGroup(az, 'aksSubscription', 'aksResourceGroup', {
         placeholder: 'AKS Cluster Resource Group',
         stepName: 'AKS Cluster Resource Group'
      }),
      new PromptAksCluster(az)
   ];
   const executeSteps: IExecuteStep[] = [
      new ExecuteCreateCertificate(az),
      new ExecuteEnableAddOn(az),
      new ExecuteCreateRoles(az),
      new ExecuteUpdateAddOn(az),
      new ExecuteDraftIngress(),
      new ExecuteOpenFiles(),
      new ExecutePromptNext(completedSteps)
   ];
   const wizard = new AzureWizard(wizardContext, {
      title,
      promptSteps,
      executeSteps
   });
   await wizard.prompt();
   await wizard.execute();
}

class PromptOutputFolder extends AzureWizardPromptStep<WizardContext> {
   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const outputFolder = (
         await wizardContext.ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            stepName: 'Output Folder',
            openLabel: 'Choose Output Folder',
            title: 'Choose Output Folder',
            defaultUri: wizardContext.outputFolder
         })
      )[0];

      if (!vscode.workspace.getWorkspaceFolder(outputFolder)) {
         throw Error(
            'Chosen Output Folder is not in current workspace. Please choose a folder in the workspace'
         );
      }

      wizardContext.outputFolder = outputFolder;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return !(
         wizardContext.outputFolder !== undefined &&
         this.completedSteps.draftDeployment
      );
   }
}

class PromptKv extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.kvSubscription === undefined) {
         throw Error('Key Vault Subscription undefined');
      }
      if (wizardContext.kvResourceGroup === undefined) {
         throw Error('Key Vault Resource Group undefined');
      }

      const kvs = getAysncResult(
         this.az.listKeyVaults(
            wizardContext.kvSubscription,
            wizardContext.kvResourceGroup
         )
      );
      const kvToItem = (kv: KeyVaultItem) => ({label: kv.vault.name || ''});
      const kvPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(kvs, kvToItem)),
         {
            ignoreFocusOut,
            stepName: 'Key Vault',
            placeHolder: 'Key Vault',
            noPicksMessage: 'No Key Vaults found'
         }
      );

      wizardContext.kv = (await kvs).find(
         (kv) => kvToItem(kv).label === kvPick.label
      );
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptNewSslCert extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const createNewSsl = 'Create New Self-Signed SSL Certificate';
      const opts: vscode.QuickPickItem[] = [
         createNewSsl,
         'Use Existing SSL Certificate'
      ].map((label) => ({label}));
      const {label} = await wizardContext.ui.showQuickPick(opts, {
         ignoreFocusOut,
         placeHolder: 'Choose SSL Option',
         title
      });
      wizardContext.newSSLCert = label === createNewSsl;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptCertName extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.certificateName = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         prompt: 'New SSL Certificate Name',
         stepName: 'Certificate Name',
         value: wizardContext.certificateName,
         validateInput: ValidateRfc1123
      });
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return !!wizardContext.newSSLCert;
   }
}

class PromptDnsZone extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.dnsSubscription === undefined) {
         throw Error('DNS Zone subscription is undefined');
      }
      if (wizardContext.dnsResourceGroup === undefined) {
         throw Error('DNS Zone resource group is undefined');
      }

      const dnsZones = getAysncResult(
         this.az.listDnsZones(
            wizardContext.dnsSubscription,
            wizardContext.dnsResourceGroup
         )
      );
      const dnsToItem = (dns: DnsZoneItem) => ({label: dns.dnsZone.name || ''});
      const dnsPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(dnsZones, dnsToItem)),
         {
            ignoreFocusOut,
            stepName: 'DNS Zone',
            placeHolder: 'DNS Zone',
            noPicksMessage: 'No DNS Zones found'
         }
      );

      wizardContext.dns = (await dnsZones).find(
         (dns) => dnsToItem(dns).label === dnsPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptCertificate extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.kv === undefined) {
         throw Error('Key Vault undefined');
      }

      const certs = getAysncResult(this.az.listCertificates(wizardContext.kv));
      const certToItem = (cert: CertificateItem) => ({
         label: cert.certificate.name || ''
      });
      const certPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(certs, certToItem)),
         {
            ignoreFocusOut,
            stepName: 'Certificate',
            placeHolder: 'Certificate',
            noPicksMessage: 'No certificates found'
         }
      );

      wizardContext.certificate = (await certs).find(
         (cert) => certToItem(cert).label === certPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return !wizardContext.newSSLCert;
   }
}

class PromptAksCluster extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.aksSubscription === undefined) {
         throw Error('AKS Subscription is undefined');
      }
      if (wizardContext.aksResourceGroup === undefined) {
         throw Error('AKS Resource Group is undefined');
      }

      const clusters = getAysncResult(
         this.az.listAksClusters(
            wizardContext.aksSubscription,
            wizardContext.aksResourceGroup
         )
      );
      const clusterToItem = (cluster: ManagedClusterItem) => ({
         label: cluster.managedCluster.name || ''
      });
      const clusterPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(clusters, clusterToItem)),
         {
            ignoreFocusOut,
            stepName: 'AKS Cluster',
            placeHolder: 'AKS Cluster',
            noPicksMessage: 'No AKS Clusters found'
         }
      );

      wizardContext.aks = (await clusters).find(
         (cluster) => clusterToItem(cluster).label === clusterPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteCreateCertificate extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 1;

   constructor(private az: AzApi) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const kv = wizardContext.kv;
      if (typeof kv === 'undefined') {
         throw Error('Key vault is undefined');
      }
      const dns = wizardContext.dns;
      if (typeof dns === 'undefined') {
         throw Error('DNS is undefined');
      }
      const name = wizardContext.certificateName;
      if (typeof name === 'undefined') {
         throw Error('Certificate name is undefined');
      }

      const pkiServerAuth = '1.3.6.1.5.5.7.3.1'; // https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-ppsec/651a90f3-e1f5-4087-8503-40d804429a88
      progress.report({message: 'Creating certificate'});
      const resp = await this.az.createCertificate(kv, name, {
         issuerName: 'Self',
         exportable: true,
         keySize: 2048,
         reuseKey: true,
         enhancedKeyUsage: [pkiServerAuth],
         lifetimeActions: [{action: 'AutoRenew', daysBeforeExpiry: 90}],
         contentType: 'application/x-pkcs12',
         keyUsage: [
            'cRLSign',
            'dataEncipherment',
            'digitalSignature',
            'keyEncipherment',
            'keyAgreement',
            'keyCertSign'
         ],
         subject: `CN=${dns.dnsZone.name}`,
         subjectAlternativeNames: {
            dnsNames: [`*.${dns.dnsZone.name}`]
         },
         validityInMonths: 24
      });

      if (failed(resp)) {
         throw Error(resp.error);
      }

      wizardContext.certificate = {certificate: resp.result};
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return !!wizardContext.newSSLCert;
   }
}

class ExecuteEnableAddOn extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 2;

   constructor(private az: AzApi) {
      super();
   }

   async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const cluster = wizardContext.aks;
      if (cluster === undefined) {
         throw Error('Cluster is undefined');
      }

      if (cluster.managedCluster.addonProfiles === undefined) {
         cluster.managedCluster.addonProfiles = {};
      }
      cluster.managedCluster.addonProfiles.httpApplicationRouting = {
         enabled: true
      };
      cluster.managedCluster.addonProfiles.azureKeyvaultSecretsProvider = {
         config: {enableSecretRotation: 'true'},
         enabled: true
      };

      if (cluster.managedCluster.ingressProfile === undefined) {
         cluster.managedCluster.ingressProfile = {};
      }
      cluster.managedCluster.ingressProfile.webAppRouting = {
         enabled: true
      };

      progress.report({
         message: 'Enabling AKS cluster add-ons'
      });
      const resp = await this.az.createOrUpdateAksCluster(cluster);
      if (failed(resp)) {
         throw Error(resp.error);
      }
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteCreateRoles extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 3;

   constructor(private az: AzApi) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      progress.report({
         message: 'Creating role assignment and updating key vault policy'
      });

      const mc = wizardContext.aks;
      if (mc === undefined) {
         throw Error('AKS managed cluster is undefined');
      }
      const subscription = wizardContext.aksSubscription;
      if (subscription === undefined) {
         throw Error('AKS subscription is undefined');
      }
      const subscriptionId = subscription.subscription.subscriptionId;
      if (subscriptionId === undefined) {
         throw Error('Subscription id is undefined');
      }
      const zoneId = wizardContext.dns?.dnsZone.id;
      if (zoneId === undefined) {
         throw Error('Zone id is undefined');
      }
      const kv = wizardContext.kv;
      if (kv === undefined) {
         throw Error('Key vault is undefined');
      }

      const id = webAppRoutingAddOnResourceId(mc);
      const resourceResp = await this.az.getResource(subscription, id);
      if (failed(resourceResp)) {
         throw Error(resourceResp.error);
      }
      const {resource} = resourceResp.result;
      const principalId = resource.properties?.principalId as
         | string
         | undefined;
      if (principalId === undefined) {
         throw Error('Principal id is undefined');
      }

      const rolePromise = this.az.createRoleAssignment(
         subscription,
         {
            name: 'befefa01-2a29-4197-83a8-272ff33ce314',
            id: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/befefa01-2a29-4197-83a8-272ff33ce314`
         },
         principalId,
         zoneId
      );
      const policyPromise = this.az.addKeyVaultPolicy(kv, {
         objectId: principalId,
         tenantId: kv.vault.properties.tenantId,
         permissions: {
            secrets: [KnownSecretPermissions.Get],
            certificates: [KnownCertificatePermissions.Get]
         }
      });

      const resps = await Promise.all([rolePromise, policyPromise]);
      resps.forEach((resp: Errorable<any>) => {
         if (failed(resp)) {
            throw Error(resp.error);
         }
      });
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteUpdateAddOn extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 4;

   constructor(private az: AzApi) {
      super();
   }

   async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const cluster = wizardContext.aks;
      if (cluster === undefined) {
         throw Error('Cluster is undefined');
      }
      const dnsZone = wizardContext.dns?.dnsZone.name;
      if (dnsZone === undefined) {
         throw Error('DNS Zone is undefined');
      }
      const dnsZoneId = wizardContext.dns?.dnsZone.id;
      if (dnsZoneId === undefined) {
         throw Error('DNS Zone id is undefined');
      }

      if (cluster.managedCluster.addonProfiles === undefined) {
         cluster.managedCluster.addonProfiles = {};
      }
      cluster.managedCluster.addonProfiles.httpApplicationRouting = {
         // eslint-disable-next-line @typescript-eslint/naming-convention
         config: {HTTPApplicationRoutingZoneName: dnsZone},
         enabled: true
      };
      if (cluster.managedCluster.ingressProfile === undefined) {
         cluster.managedCluster.ingressProfile = {};
      }
      cluster.managedCluster.ingressProfile.webAppRouting = {
         enabled: true,
         dnsZoneResourceId: dnsZoneId
      };

      progress.report({
         message: 'Updating AKS cluster Web App Routing add-on'
      });
      const resp = await this.az.createOrUpdateAksCluster(cluster);
      if (failed(resp)) {
         throw Error(resp.error);
      }
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteDraftIngress extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 5;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const destination = wizardContext.outputFolder?.fsPath;
      if (destination === undefined) {
         throw Error('Destination is undefined');
      }
      const host = wizardContext.dns?.dnsZone.name;
      if (host === undefined) {
         throw Error('Host is undefined');
      }
      const cert = wizardContext.certificate?.certificate.id;
      if (cert === undefined) {
         throw Error('Certificate is undefined');
      }

      const osm = false; // default to not using osm for now. Need to add ability to add application ns to the OSM control plane for OSM.
      // holding off on this until web app routing service mesh is changed

      progress.report({
         message: 'Running Draft to generate Kubernetes manifests'
      });
      const cmd = buildUpdateIngressCommand(destination, host, cert, osm);
      const [success, err] = await runDraftCommand(cmd);
      const isSuccess = err?.length === 0 && success?.length !== 0;
      if (!isSuccess) {
         throw Error(`Draft command failed: ${err}`);
      }
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecuteOpenFiles extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 6;

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      const outputFolder = wizardContext.outputFolder;
      if (outputFolder === undefined) {
         throw Error('Output folder is undefined');
      }

      const glob = new vscode.RelativePattern(
         outputFolder,
         `**/${INGRESS_FILENAME}`
      );
      const [created] = await vscode.workspace.findFiles(glob, undefined, 1);
      await vscode.workspace
         .openTextDocument(created)
         .then((doc) => vscode.window.showTextDocument(doc, {preview: false}));
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

class ExecutePromptNext extends AzureWizardExecuteStep<WizardContext> {
   public priority: number = 7;

   constructor(private completedSteps: CompletedSteps) {
      super();
   }

   public async execute(
      wizardContext: WizardContext,
      progress: vscode.Progress<{
         message?: string | undefined;
         increment?: number | undefined;
      }>
   ): Promise<void> {
      this.completedSteps.draftIngress = true;

      const deployButton = 'Deploy';
      await vscode.window
         .showInformationMessage(
            'The Ingress was created. Next, deploy to your cluster.',
            deployButton
         )
         .then((input) => {
            if (input === deployButton) {
               vscode.commands.executeCommand(
                  'aks-draft-extension.runDeploy',
                  this.completedSteps
               );
            }
         });
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return true;
   }
}

function webAppRoutingAddOnResourceId(mc: ManagedClusterItem): string {
   const mcId = mc.managedCluster.id;
   if (mcId === undefined) {
      throw Error('Managed cluster id is undefined');
   }
   const mcName = mc.managedCluster.name;
   if (mcName === undefined) {
      throw Error('Managed cluster name is undefined');
   }
   const resourceGroup = mc.managedCluster.nodeResourceGroup;
   if (resourceGroup === undefined) {
      throw Error('Node resource group is undefined');
   }

   const {subscriptionId} = parseAzureResourceId(mcId);
   return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/webapprouting-${mcName}`;
}
