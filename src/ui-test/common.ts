import {
   TitleBar,
   VSBrowser,
   InputBox,
   until,
   By,
   Notification,
   Workbench
} from 'vscode-extension-tester';

let titleBar: TitleBar;
let browser: VSBrowser;
let input: InputBox;

export async function setWorkspace(
   pathToWorkspace: string,
   browser: VSBrowser
) {
   titleBar = new TitleBar();
   await titleBar.select('File', 'Add Folder to Workspace...');
   input = await InputBox.create();
   await input.setText(pathToWorkspace);
   await browser.driver.wait(
      until.elementLocated(By.className('quick-input-message'))
   );
   await input.confirm();
}

export async function notificationFound(
   text: string
): Promise<Notification | undefined> {
   const notifications = await new Workbench().getNotifications();
   return notifications.find(async function (notification) {
      (await notification.getMessage()) === text;
   });
}
