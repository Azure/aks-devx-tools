import * as vscode from 'vscode'
import {getExtensionPath, longRunning} from '../../utils/host'
import {failed} from '../../utils/errorable'
import {createWebView} from '../../utils/webview'
import * as os from 'os'
import {
   createDraftWebView,
   downloadDraftBinary,
   runDraftCommand
} from './helper/runDraftHelper'
import {InstallationResponse} from './model/installationResponse'
import {setFlagsFromString} from 'v8'
import {
   buildCreateCommand,
   buildCreateConfig
} from './helper/draftCommandBuilder'
import {reporter} from '../../utils/reporter'

export default async function runDraftCreate(
   _context: vscode.ExtensionContext,
   destination: string
): Promise<void> {
   const extensionPath = getExtensionPath()
   if (failed(extensionPath)) {
      vscode.window.showErrorMessage(extensionPath.error)
      return undefined
   }

   // Download Binary first
   const downladResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   )
   if (!downladResult) {
      return undefined
   }

   // Create webview with user input required.
   // Abstract - Long running Tasks:
   // Webview to take all inputs necessary
   // Get user input upfront. Then start the installation process.
   const webview = createWebView('AKS Draft Tool', `Draft Create`)
   const installationResponse: InstallationResponse = {name: 'create'}
   createDraftWebView(
      'create',
      webview,
      extensionPath.result,
      installationResponse,
      true
   )

   // Step 3: Report it back in the webview with outcome.
   // After the download of the exe or equivalent if first time
   // ---> Ground up work for this is 80 percetn done and checkout the helper methods: in the project.
   // Once the submit for them webview is successfull we handle rest of the installation process for Azure Service Operator.
   webview.onDidReceiveMessage(async (message) => {
      if (
         message.language &&
         message.port &&
         (message.fileType === 'dockerfile' ||
            (message.appName && message.workflow))
      ) {
         const language = message.language
         const fileType = message.fileType
         const port = message.port
         const appName = message.appName
         const workflow = message.workflow
         const dotnetVersion = message.dotnetVersion

         const configPath = buildCreateConfig(
            language,
            port,
            appName,
            workflow,
            dotnetVersion
         )
         const command = buildCreateCommand(destination, fileType, configPath)

         const result = await runDraftCommand(command)
         const createResponse: InstallationResponse = {
            name: 'create',
            stdout: result[0],
            stderr: result[1]
         }
         if (reporter) {
            const resultSuccessOrFailure =
               result[1]?.length === 0 && result[0]?.length !== 0
            reporter.sendTelemetryEvent('createDraftResult', {
               createDraftResult: `${resultSuccessOrFailure}`
            })
         }
         createDraftWebView(
            'create',
            webview,
            extensionPath.result,
            createResponse,
            false
         )
      }
      return undefined
   }, undefined)
}
