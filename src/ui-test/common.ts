import { sleep } from '../utils/sleep';
import { TitleBar, VSBrowser, InputBox } from 'vscode-extension-tester';

let titleBar: TitleBar;
let browser: VSBrowser;
let input: InputBox;

export async function setWorkspace(pathToWorkspace: string) {
    console.log('Opening File > Add Folder to Workspace...');
    titleBar = new TitleBar();
    await titleBar.select('File', 'Add Folder to Workspace...');
    console.log('Creating new input box');
    input = await InputBox.create();
    console.log('Setting path to workspace');
    await input.setText(pathToWorkspace);
    browser = VSBrowser.instance;
    await browser.driver.sleep(3000);
    console.log('Confirming path to workspace');
    await input.confirm();
    await browser.driver.sleep(3000);
}

export async function retry(
    fn: () => Promise<void>,
    times: number,
    intervalms: number
) {
    for (let i = 0; i < times; i++) {
        try {
            fn();
            break;
        } catch { }
        sleep(intervalms);
    }
}
