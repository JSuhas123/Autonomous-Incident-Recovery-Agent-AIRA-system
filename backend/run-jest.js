const { runCLI } = require('jest');
const path = require('path');

const projectRoot = __dirname;

runCLI(
  {
    testPathPattern: '.*\\.test\\.js$',
    passWithNoTests: false,
    verbose: true,
    coverage: false,
    detectOpenHandles: true,
    forceExit: true,
  },
  [projectRoot]
).then((results) => {
  console.log('\n\n=== TEST RESULTS SUMMARY ===');
  const { numPassedTests, numFailedTests, numTotalTests } = results.results;
  console.log(`Total: ${numTotalTests}, Passed: ${numPassedTests}, Failed: ${numFailedTests}`);
  process.exit(results.results.success ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
