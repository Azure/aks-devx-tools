import * as vscode from 'vscode';

export async function getAsyncOptions<T>(
   arr: Promise<T[]>,
   callbackfn: (a: T) => vscode.QuickPickItem
): Promise<vscode.QuickPickItem[]> {
   return (await arr).map(callbackfn);
}
