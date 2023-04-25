import * as assert from 'assert';
import {
   ensureDraftBinary,
   getDraftConfig,
   runDraftCommand
} from '../../../../../commands/runDraftTool/helper/runDraftHelper';
import {
   getAsyncResult,
   failed,
   succeeded
} from '../../../../../utils/errorable';

suite('Run Draft Helper Test Suite', () => {
   test('it returns true when draft binary exists', async () => {
      var ensureDraftBinaryResult = await ensureDraftBinary();
      assert.deepStrictEqual(succeeded(ensureDraftBinaryResult), true);
   });

   test('it returns draft config', () => {
      var draftConfig = getDraftConfig();
      assert.deepStrictEqual(succeeded(draftConfig), true);
   });

   test('it runs draft command without error', async () => {
      var result = await runDraftCommand('version');
      assert.strictEqual(result[1], '');
   });
});
