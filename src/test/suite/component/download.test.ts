import * as assert from 'assert';
import {toTempFile, once} from '../../../component/download';
import {succeeded} from '../../../utils/errorable';
import * as fs from 'fs';

suite('Run Download Test Suite', () => {
   test('it creates temp file from given source url', async () => {
      var result = await toTempFile(
         'https://github.com/Azure/aks-devx-tools/blob/main/README.md'
      );
      assert.strictEqual(succeeded(result), true);
   });
   test('it downloads from given source url into the destination file', async () => {
      const sourceUrl =
         'https://github.com/Azure/aks-devx-tools/blob/main/README.md';
      const destinationFile = 'test_download.md';
      var result = await once(sourceUrl, destinationFile);
      assert.strictEqual(succeeded(result), true);

      if (fs.existsSync(destinationFile)) {
         fs.unlink(destinationFile, (err) => {
            assert(!err);
         });
      }
   });
});
