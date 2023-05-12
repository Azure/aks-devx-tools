import * as assert from 'assert';
import {
   ActivityBar,
   ExtensionsViewItem,
   ExtensionsViewSection
} from 'vscode-extension-tester';
const packageJson = require('../../package.json');
describe('Extension View Test', () => {
   let devXToolsExtension: ExtensionsViewItem;

   it('tests the extension info', async function () {
      this.timeout(10000);
      const view = await (
         await new ActivityBar().getViewControl('Extensions')
      )?.openView();
      const extensions = (await view
         ?.getContent()
         .getSection('Installed')) as ExtensionsViewSection;
      devXToolsExtension = (await extensions.findItem(
         `@installed ${packageJson.displayName}`
      )) as ExtensionsViewItem;

      const desc = await devXToolsExtension.getDescription();
      const version = await devXToolsExtension.getVersion();

      assert.strictEqual(
         desc,
         packageJson.description
      );
      assert.strictEqual(version, packageJson.version);
   });
});
