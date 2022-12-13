import {CompletedSteps} from './model/guidedExperience';
import * as vscode from 'vscode';
import {Context} from './model/context';
import {StateApi, State} from '../../utils/state';
import {longRunning} from '../../utils/host';
import {downloadDraftBinary} from './helper/runDraftHelper';
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
   ResourceGroupItem,
   SubscriptionItem
} from '../../utils/az';
import {failed, getAysncResult} from '../../utils/errorable';
import {sort} from '../../utils/sort';
import {ignoreFocusOut} from './helper/commonPrompts';
import {getAsyncOptions, removeRecentlyUsed} from '../../utils/quickPick';

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
      new PromptKvSubscription(az),
      new PromptKvResourceGroup(az),
      new PromptKv(az),
      new PromptNewSslCert(),
      new PromptCertificate(az),
      new PromptDnsSubscription(az),
      new PromptDnsResourceGroup(az),
      new PromptDnsZone(az)
   ];
   const executeSteps: IExecuteStep[] = [new ExecuteCreateCertificate(az)];
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

class PromptKvSubscription extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const subs = getAysncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: 'Key Vault Subscription',
            placeHolder: 'Key Vault Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      wizardContext.kvSubscription = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptKvResourceGroup extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.kvSubscription === undefined) {
         throw Error('Key Vault Subscription is undefined');
      }

      const rgs = getAysncResult(
         this.az.listResourceGroups(wizardContext.kvSubscription)
      );
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(rgs, rgToItem)),
         {
            ignoreFocusOut,
            stepName: 'KV Resource Group',
            placeHolder: 'Key Vault Resource Group',
            noPicksMessage: 'No Resource Groups found'
         }
      );

      wizardContext.kvResourceGroup = (await rgs).find(
         (rg) => rgToItem(rg).label === rgPick.label
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
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
      const createNewSsl = 'Create New SSL Certificate';
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

class PromptDnsSubscription extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      const subs = getAysncResult(this.az.listSubscriptions());
      const subToItem = (sub: SubscriptionItem) => ({
         label: sub.subscription.displayName || '',
         description: sub.subscription.subscriptionId || ''
      });
      const subPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(subs, subToItem)),
         {
            ignoreFocusOut,
            stepName: 'DNS Zone Subscription',
            placeHolder: 'DNS Zone Subscription',
            noPicksMessage: 'No Subscriptions found'
         }
      );

      wizardContext.dnsSubscription = (await subs).find(
         (sub) =>
            subToItem(sub).description ===
            removeRecentlyUsed(subPick.description || '')
      );
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return !!wizardContext.newSSLCert;
   }
}

class PromptDnsResourceGroup extends AzureWizardPromptStep<WizardContext> {
   constructor(private az: AzApi) {
      super();
   }

   public async prompt(wizardContext: WizardContext): Promise<void> {
      if (wizardContext.dnsSubscription === undefined) {
         throw Error('DNS Zone subscription is undefined');
      }

      const rgs = getAysncResult(
         this.az.listResourceGroups(wizardContext.dnsSubscription)
      );
      const rgToItem = (rg: ResourceGroupItem) => ({
         label: rg.resourceGroup.name || ''
      });
      const rgPick = await wizardContext.ui.showQuickPick(
         sort(getAsyncOptions(rgs, rgToItem)),
         {
            ignoreFocusOut,
            stepName: 'DNS Zone Resource Group',
            placeHolder: 'DNS Zone Resource Group',
            noPicksMessage: 'No Resource Group found'
         }
      );

      wizardContext.dnsResourceGroup = (await rgs).find(
         (rg) => rgToItem(rg).label === rgPick.label
      );
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
      return !!wizardContext.newSSLCert;
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

      const pkiServerAuth = '1.3.6.1.5.5.7.3.1'; // https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-ppsec/651a90f3-e1f5-4087-8503-40d804429a88
      progress.report({message: 'Creating certificate'});
      const resp = await this.az.createCertificate(
         kv,
         'aks-devx-tools-cert-2',
         {
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
         }
      );

      if (failed(resp)) {
         throw Error(resp.error);
      }

      wizardContext.certificate = {certificate: resp.result};
   }

   public shouldExecute(wizardContext: WizardContext): boolean {
      return !!wizardContext.newSSLCert;
   }
}

// select azure dns
