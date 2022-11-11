import {IActionContext} from '@microsoft/vscode-azext-utils';
import {ExtensionContext} from 'vscode';

export interface Context {
   actionContext: IActionContext;
   extensionContext: ExtensionContext;
}
