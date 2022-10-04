import * as vscode from "vscode";

export interface ContextApi {
  getPort(): string | undefined;
  setPort(port: string): void;
  getImage(): string | undefined;
  setImage(image: string): void;
}

const portKey = "port";
const imageKey = "image";

export class Context implements ContextApi {
  constructor(private ctx: vscode.ExtensionContext) {}

  getPort(): string | undefined {
    return this.get(portKey);
  }

  setPort(port: string) {
    return this.set(portKey, port);
  }

  getImage(): string | undefined {
    return this.get(imageKey);
  }

  setImage(image: string) {
    return this.set(imageKey, image);
  }

  private get(key: string): string | undefined {
    return this.ctx.workspaceState.get(key);
  }

  private set(key: string, val: string) {
    return this.ctx.workspaceState.update(key, val);
  }
}
