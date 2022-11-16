import {KnownRunStatus} from '@azure/arm-containerregistry';
import {buildAcrImage} from '../../utils/dockerExtension';
import {longRunning} from '../../utils/host';
import {State, StateApi} from '../../utils/state';
import {Context} from './model/context';
import {parseAzureResourceId} from '@microsoft/vscode-azext-azureutils';
import * as vscode from 'vscode';
import {image} from '../../utils/acr';
import {CompletedSteps} from './model/guidedExperience';

export async function runBuildAcrImage(
   {actionContext, extensionContext}: Context,
   completedSteps: CompletedSteps
) {
   const state: StateApi = State.construct(extensionContext);

   let chosenDockerfile: vscode.Uri | undefined = undefined;
   const dockerfile = state.getDockerfile();
   if (completedSteps.draftDockerfile && dockerfile) {
      chosenDockerfile = vscode.Uri.file(dockerfile);
   }

   const run = await longRunning('Building ACR Image', () =>
      buildAcrImage(chosenDockerfile)
   );
   if (run === undefined) {
      // they cancelled experience in the Docker extension
      return;
   }

   const {status, outputImages, id} = run;
   if (status !== KnownRunStatus.Succeeded) {
      throw Error('Build ACR Image failed');
   }
   if (outputImages === undefined || outputImages.length === 0) {
      throw Error('Output images are undefined');
   }
   if (id === undefined) {
      throw Error('Id is undefined');
   }

   const {registry, repository, tag} = outputImages[0];
   if (registry === undefined) {
      throw Error('Registry is undefined');
   }
   if (repository === undefined) {
      throw Error('Repository is undefined');
   }
   if (tag === undefined) {
      throw Error('Tag is undefined');
   }
   const {subscriptionId, resourceGroup} = parseAzureResourceId(id);
   state.setAcrName(registry);
   state.setAcrRepo(repository);
   state.setAcrTag(tag);
   state.setAcrSubscription(subscriptionId);
   state.setAcrResourceGroup(resourceGroup);
   state.setImage(image(registry, repository, tag));

   const generateButton = 'Generate';
   await vscode.window
      .showInformationMessage(
         'The Image was built on ACR. Next, generate Kubernetes Deployments and Manifests',
         generateButton
      )
      .then((input) => {
         if (input === generateButton) {
            completedSteps.buildOnAcr = true;
            vscode.commands.executeCommand(
               'aks-draft-extension.runDraftDeployment',
               undefined,
               completedSteps
            );
         }
      });
}
