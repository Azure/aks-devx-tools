import * as assert from 'assert';
import {ValidatePort, ValidateRfc1123} from '../../../utils/validation';

const passingTestRet = undefined;

suite('Validation Test Suite', () => {
   test('Port validations', async () => {
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

   test('Rfc 1123 validations', async () => {
      const valid = [
         'app-name',
         'frontend',
         'front-end-demo',
         'a'.repeat(63),
         '123',
         '1number'
      ];
      const validatedValid = valid.map(ValidateRfc1123);

      const invalid = [
         'Capitalized',
         'cApitalized',
         'CAPITALIZED',
         '-start',
         'end-',
         'a'.repeat(64),
         'special/chars',
         'other#chars'
      ];
      const validatedInvalid = invalid.map(ValidateRfc1123);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });
});
