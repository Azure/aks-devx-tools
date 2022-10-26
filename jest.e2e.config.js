const path = require('path');

module.exports = {
   preset: 'ts-jest',
   testEnvironment: 'node',
   roots: [path.join(__dirname, 'src/test/e2e')],
   testMatch: [path.join(__dirname, 'src/test/e2e/**/*.test.ts')],
   verbose: true,
   cache: false
};
