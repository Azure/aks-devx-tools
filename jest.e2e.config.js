const path = require('path');

module.exports = {
   preset: 'ts-jest',
   testEnvironment: 'node',
   roots: [path.join(__dirname, 'out/test/e2e')],
   testMatch: [path.join(__dirname, 'out/test/e2e/**/*.test.js')],
   collectCoverage: true,
   verbose: true,
   runInBand: true,
   cache: false,
   useStderr: true,
   forceExit: true,
   detectOpenHandles: true
};
