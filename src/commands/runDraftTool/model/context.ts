import {IActionContext} from '@microsoft/vscode-azext-utils';
import {ExtensionContext} from 'vscode';

export type Context = IActionContext & ExtensionContext;
