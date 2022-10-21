// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import runDraftCreate from './commands/runDraftTool/runDraftCreate'
import runDraftGenerateWorkflow from './commands/runDraftTool/runDraftGenerateWorkflow'
import runDraftSetupGH from './commands/runDraftTool/runDraftSetupGH'
import runDraftUpdate from './commands/runDraftTool/runDraftUpdate'
import {Reporter, reporter} from './utils/reporter'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
   // Use the console to output diagnostic information (console.log) and errors (console.error)
   // This line of code will only be executed once when your extension is activated
   console.log(
      'Congratulations, your extension "aks-draft-extension" is now active!'
   )
   context.subscriptions.push(new Reporter(context))

   // The command has been defined in the package.json file
   // Now provide the implementation of the command with registerCommand
   // The commandId parameter must match the command field in package.json

   let disposableCreate = vscode.commands.registerCommand(
      'aks-draft-extension.runDraftCreate',
      async (folder) => {
         if (reporter) {
            reporter.sendTelemetryEvent('command', {
               command: 'aks-draft-extension.runDraftCreate'
            })
         }
         // The code you place here will be executed every time your command is executed
         // Display a message box to the user
         runDraftCreate(context, vscode.Uri.parse(folder).fsPath)
      }
   )
   let disposableSetupGH = vscode.commands.registerCommand(
      'aks-draft-extension.runDraftSetupGH',
      async (folder) => {
         if (reporter) {
            reporter.sendTelemetryEvent('command', {
               command: 'aks-draft-extension.runDraftSetupGH'
            })
         }
         // The code you place here will be executed every time your command is executed
         // Display a message box to the user
         runDraftSetupGH(context)
      }
   )
   let disposableGenerateWorkflow = vscode.commands.registerCommand(
      'aks-draft-extension.runDraftGenerateWorkflow',
      async (folder) => {
         if (reporter) {
            reporter.sendTelemetryEvent('command', {
               command: 'aks-draft-extension.runDraftGenerateWorkflow'
            })
         }
         // The code you place here will be executed every time your command is executed
         // Display a message box to the user
         runDraftGenerateWorkflow(context, vscode.Uri.parse(folder).fsPath)
      }
   )
   let disposableUpdate = vscode.commands.registerCommand(
      'aks-draft-extension.runDraftUpdate',
      async (folder) => {
         if (reporter) {
            reporter.sendTelemetryEvent('command', {
               command: 'aks-draft-extension.runDraftUpdate'
            })
         }
         // The code you place here will be executed every time your command is executed
         // Display a message box to the user
         runDraftUpdate(context, vscode.Uri.parse(folder).fsPath)
      }
   )

   context.subscriptions.push(disposableCreate)
   context.subscriptions.push(disposableSetupGH)
   context.subscriptions.push(disposableGenerateWorkflow)
   context.subscriptions.push(disposableUpdate)
}

// this method is called when your extension is deactivated
export function deactivate() {}
