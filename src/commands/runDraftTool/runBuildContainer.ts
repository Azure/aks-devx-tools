import * as vscode from "vscode";
import { Context, ContextApi } from "../../utils/context";
import { longRunning } from "../../utils/host";

export default async function runBuildContainer(
  _context: vscode.ExtensionContext
): Promise<void> {
  const ctx: ContextApi = new Context(_context);

  // TODO: refactor this but it will be hard to do that without editing the docker extension itself
  // need error handling + this is super flimsy
  vscode.commands
    .executeCommand("vscode-docker.registries.azure.buildImage")
    .then(async () => {
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
              (e) => {
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
                  console.log(registry, repo, tag);

                  if (registry && repo && tag) {
                    const image = `${registry}/${repo}:${tag}`;
                    ctx.setImage(image);

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
