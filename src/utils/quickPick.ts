import * as vscode from 'vscode';


// if something was recently used in azext quick pick this text is appened to the description
export const removeRecentlyUsed = (description: string) =>
   description.replace(' (recently used)', '');

export async function getAsyncOptions<T>(
   arr: Promise<T[]>,
   callbackfn: (a: T) => vscode.QuickPickItem
): Promise<vscode.QuickPickItem[]> {
   return (await arr).map(callbackfn);
}
