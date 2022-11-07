import * as assert from 'assert';
import {ValidatePort} from '../../../utils/validation';

const passingTestRet = undefined;

suite('Validation Test Suite', () => {
   test('Port test', async () => {
      // valid ports
      const validPorts = ['8080', '80', '90', '1', '65535'];
      const validatedValid = validPorts.map(ValidatePort);
      const invalidPorts = [
         '0',
         '65536',
         '-1',
         '-999999',
         '99999999999',
         'NaN',
         'dog',
         'Cat'
      ];
      const validatedInvalid = invalidPorts.map(ValidatePort);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });
});
