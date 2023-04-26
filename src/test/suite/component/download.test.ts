import * as assert from 'assert';
import {once} from '../../../component/download';
import {succeeded, getAsyncResult} from '../../../utils/errorable';
import * as fs from 'fs';
import path = require('path');

suite('Run Download Test Suite', () => {
   test('it downloads from given source url into the destination file', async () => {
      const sourceUrl =
         'https://raw.githubusercontent.com/Azure/aks-devx-tools/0.1.1/README.md';
      const destinationFile = 'downloaded_file.md';
      const result = await once(sourceUrl, destinationFile);
      assert.strictEqual(succeeded(result), true);
      const downloadedContent = fs.readFileSync(destinationFile);
      const expectedContent = fs.readFileSync(
         path.join('src', 'test', 'suite', 'component', 'test_download.md')
      );
      assert.strictEqual(
         downloadedContent.toString().trim(),
         expectedContent.toString().trim()
      );
      if (fs.existsSync(destinationFile)) {
         fs.unlink(destinationFile, (err) => {
            assert(!err);
         });
      }
   });
});
