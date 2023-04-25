import * as assert from 'assert';
import {
   buildCreateCommand,
   buildCreateConfig,
   buildSetupGHCommand,
   buildGenerateWorkflowCommand,
   buildUpdateIngressCommand
} from '../../../../../commands/runDraftTool/helper/draftCommandBuilder';
import * as path from 'path';

suite('Draft Command Builder Test Suite', () => {
   test('it builds create command for dockerfile', () => {
      const testDestination = './';
      const fileType = 'dockerfile';
      const configPath = './testConfig';

      assert.strictEqual(
         buildCreateCommand(testDestination, fileType, configPath),
         `create --skip-file-detection --destination=${testDestination} --dockerfile-only --create-config=${configPath}`
      );
   });
   test('it builds create command for deployment file', () => {
      const testDestination = './';
      const fileType = 'deployment';
      const configPath = './testConfig';

      assert.strictEqual(
         buildCreateCommand(testDestination, fileType, configPath),
         `create --skip-file-detection --destination=${testDestination} --deployment-only --create-config=${configPath}`
      );
   });
   test('it returns the create config file name', () => {
      const lang = 'go';
      const port = '8080';
      const appName = 'testApp';
      const workflow = 'testWorkflow';
      const langVersion = '1.18';
      const namespace = 'testNamespace';
      const imageName = 'testImage';
      const imageTag = '0.0.1';
      const result = buildCreateConfig(
         lang,
         port,
         appName,
         workflow,
         langVersion,
         namespace,
         imageName,
         imageTag
      );
      assert.match(result, /^.*\.(yaml)$/);
   });

   test('it returns the correct GH command', () => {
      const appName = 'testAppName';
      const subscriptionId = 'testSubscriptionId';
      const resourceGroup = 'testResourceGroup';
      const ghRepo = 'testGHRepo';

      assert.strictEqual(
         buildSetupGHCommand(appName, subscriptionId, resourceGroup, ghRepo),
         `setup-gh -p azure -a ${appName} -s ${subscriptionId} -r ${resourceGroup} -g ${ghRepo}`
      );
   });

   test('it returns the correct generate workflow command', () => {
      const destination = './';
      const clusterName = 'testCluster';
      const resourceGroup = 'testRG';
      const registryName = 'testRegistry';
      const containerName = 'testContainer';
      const branch = 'main';

      assert.strictEqual(
         buildGenerateWorkflowCommand(
            destination,
            clusterName,
            resourceGroup,
            registryName,
            containerName,
            branch
         ),
         `generate-workflow -c ${clusterName} -r ${registryName} --container-name ${containerName} -g ${resourceGroup} -d ${destination} -b ${branch}`
      );
   });

   test('it returns the correct generate workflow command', () => {
      const destination = './';
      const host = 'loacalhost';
      const certificate = 'testCert';
      const osm = false;

      assert.strictEqual(
         buildUpdateIngressCommand(destination, host, certificate, osm),
         `update -a webapp_routing -d "${path.join(
            destination,
            '..'
         )}" --variable ingress-tls-cert-keyvault-uri="${certificate}" --variable ingress-use-osm-mtls=${
            osm ? 'true' : 'false'
         } --variable ingress-host="${host}"`
      );
   });
});
