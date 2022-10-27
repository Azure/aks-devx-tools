import * as vscode from 'vscode';

/**
 * Add any new states to the keys constant. The StateApi and State class that implements it
 * generate methods based on the keys constant. For example, if keys = ['port', 'image'] then the
 * StateApi type will include methods getPort, setPort, getImage, and setImage. The State class
 * implements the StateApi and will do the same.
 */
const keys = [
   'port',
   'image',
   'acrSubscription',
   'acrResourceGroup',
   'acrName',
   'acrRepo',
   'acrTag',
   'dockerfile',
   'deploymentType',
   'manifestPath',
   'chartPath'
] as const;

type GetMethodName = `get${Capitalize<typeof keys[number]>}`;
type SetMethodName = `set${Capitalize<typeof keys[number]>}`;
type GetMethods = {[m in GetMethodName]: () => string | undefined};
type SetMethods = {[m in SetMethodName]: (val: string) => void};
export type StateApi = GetMethods & SetMethods;

export class State {
   private constructor(private ctx: vscode.ExtensionContext) {
      assertIs<StateApi>(this);
      for (const key of keys) {
         const cap = capitalize(key);
         this[`get${cap}` as GetMethodName] = () => this.get(key);
         this[`set${cap}` as SetMethodName] = (val: string) =>
            this.set(key, val);
      }
   }

   // to retain TypeScript type safety we make the constructor private and exlusively
   // expose the construct method
   static construct(ctx: vscode.ExtensionContext): State & StateApi {
      return new State(ctx) as State & StateApi;
   }

   private get(key: string): string | undefined {
      return this.ctx.workspaceState.get(key);
   }

   private set(key: string, val: string) {
      return this.ctx.workspaceState.update(key, val);
   }
}

function assertIs<T>(value: unknown): asserts value is T {}
const capitalize = (s: string) => s[0].toUpperCase() + s.substring(1);
