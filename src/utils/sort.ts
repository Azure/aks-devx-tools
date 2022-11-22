import * as vscode from 'vscode';

export async function sort(
   items: Promise<vscode.QuickPickItem[]>
): Promise<vscode.QuickPickItem[]> {
   return (await items).sort((a, b) => a.label.localeCompare(b.label));
}
