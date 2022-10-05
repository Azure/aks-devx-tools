import { Registry } from "@azure/arm-containerregistry";
import * as vscode from "vscode";
import { AzApi } from "../../utils/az";
import { Context, ContextApi } from "../../utils/context";
import { Errorable, succeeded } from "../../utils/errorable";
import { longRunning } from "../../utils/host";

export default async function runBuildContainer(
  _context: vscode.ExtensionContext,
  az: AzApi
): Promise<void> {
  const ctx: ContextApi = new Context(_context);
  const subsResp = az.getSubscriptions();

  // TODO: refactor this but it will be hard to do that without editing the docker extension itself
  // need error handling + this is super flimsy
  vscode.commands
    .executeCommand("vscode-docker.registries.azure.buildImage")
    .then(async () => {
      const acrsResp: Promise<Errorable<Registry[]>>[] = [];
      const awaitedSubs = await subsResp;
      if (succeeded(awaitedSubs)) {
        const subs = awaitedSubs.result;
        subs.forEach((sub) =>
          acrsResp.push(az.getAcrsFromSub(sub.subscriptionId as string))
        );
      }

      await longRunning(
        "Building container",
        () =>
          new Promise<void>((resolve, reject) => {
            const disposables: vscode.Disposable[] = [];
            const stop = () => {
              disposables.forEach((d) => d.dispose());
              resolve();
            };
            vscode.workspace.onDidChangeTextDocument(
              async (e) => {
                if (
                  !e.document.fileName.startsWith(
                    "extension-output-ms-azuretools.vscode-docker"
                  )
                )
                  return;

                for (const { text } of e.contentChanges) {
                  const registry = text.match(/\s*registry: (?<registry>\S*)/)
                    ?.groups?.registry;
                  const repo = text.match(/\s*repository: (?<repo>\S*)/)?.groups
                    ?.repo;
                  const tag = text.match(/\s*tag: (?<tag>\S*)/)?.groups?.tag;

                  if (registry && repo && tag) {
                    const image = `${registry}/${repo}:${tag}`;
                    ctx.setImage(image);
                    ctx.setAcrRepository(repo);
                    ctx.setAcrTag(tag);

                    const acrs: Registry[] = [];
                    const acrsResult = await Promise.all(acrsResp);
                    acrsResult.forEach((res) => {
                      if (succeeded(res)) {
                        acrs.push(...res.result);
                      }
                    });
                    const acr = acrs.find(
                      (acr) => acr.loginServer === registry
                    );
                    ctx.setAcrName(acr?.name as string);
                    const { subscription, resourceGroup } = az.parseId(
                      acr?.id || ""
                    );
                    ctx.setSubscription(subscription as string);
                    ctx.setAcrResourceGroup(resourceGroup as string);

                    const draftKubernetesDeployment =
                      "Draft Kubernetes Deployment and Service";
                    vscode.window
                      .showInformationMessage(
                        `Built container ${image}`,
                        draftKubernetesDeployment
                      )
                      .then((option) => {
                        if (option === draftKubernetesDeployment) {
                          vscode.commands.executeCommand(
                            "aks-draft-extension.runDraftDeployment"
                          );
                        }
                      });
                    stop();
                  }
                }
              },
              undefined,
              disposables
            );
            // clean up disposables after 15 minutes
            setInterval(() => stop(), 900_000);
          })
      );
    });
}
