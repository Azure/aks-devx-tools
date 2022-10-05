import * as vscode from "vscode";

export interface ContextApi {
  getPort(): string | undefined;
  setPort(port: string): void;
  getImage(): string | undefined;
  setImage(image: string): void;
  getSubscription(): string | undefined;
  setSubscription(subscription: string): void;
  getAcrResourceGroup(): string | undefined;
  setAcrResourceGroup(rg: string): void;
  getAcrName(): string | undefined;
  setAcrName(name: string): void;
  getAcrRepository(): string | undefined;
  setAcrRepository(repo: string): void;
  getAcrTag(): string | undefined;
  setAcrTag(tag: string): void;
}

const portKey = "port";
const imageKey = "image";
const subKey = "subscription";
const acrRgKey = "acrResourceGroup";
const acrNameKey = "acrName";
const acrRepoKey = "acrRepo";
const acrTagKey = "acrTag";

export class Context implements ContextApi {
  constructor(private ctx: vscode.ExtensionContext) {}

  getAcrTag(): string | undefined {
    return this.get(acrTagKey);
  }

  setAcrTag(tag: string): void {
    this.set(acrTagKey, tag);
  }

  getSubscription(): string | undefined {
    return this.get(subKey);
  }
  setSubscription(subscription: string): void {
    this.set(subKey, subscription);
  }
  getAcrResourceGroup(): string | undefined {
    return this.get(acrRgKey);
  }
  setAcrResourceGroup(rg: string): void {
    this.set(acrRgKey, rg);
  }
  getAcrName(): string | undefined {
    return this.get(acrNameKey);
  }
  setAcrName(name: string): void {
    this.set(acrNameKey, name);
  }
  getAcrRepository(): string | undefined {
    return this.get(acrRepoKey);
  }
  setAcrRepository(repo: string): void {
    this.set(acrRepoKey, repo);
  }

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
