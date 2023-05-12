import {
   TitleBar,
   VSBrowser,
   InputBox,
   until,
   By
} from 'vscode-extension-tester';

let titleBar: TitleBar;
let browser: VSBrowser;
let input: InputBox;

export async function setWorkspace(
   pathToWorkspace: string,
   browser: VSBrowser
) {
   console.log('Opening File > Add Folder to Workspace...');
   titleBar = new TitleBar();
   console.log(titleBar);
   await titleBar.select('File', 'Add Folder to Workspace...');
   console.log('Creating new input box');
   input = await InputBox.create();
   console.log('Setting path to workspace');
   await input.setText(pathToWorkspace);
   await browser.driver.wait(
      until.elementLocated(By.className('quick-input-message'))
   );
   console.log('Confirming path to workspace');
   await input.confirm();
}
