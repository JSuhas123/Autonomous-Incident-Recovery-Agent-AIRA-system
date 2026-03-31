/**
 * Comprehensive Test Runner
 * Runs all test suites and generates a production readiness report
 */

const { spawn } = require('child_process');
const fs = require('fs');

const tests = [
  { name: 'Unit Tests', cmd: 'npm', args: ['run', 'test:unit', '--', '--silent'] },
  { name: 'Integration Tests', cmd: 'npm', args: ['run', 'test:integration', '--', '--silent'] },
  { name: 'Load Tests (Quick)', cmd: 'npm', args: ['run', 'test:load:quick', '--', '--silent'] },
];

const results = {};
let passed = 0;
let failed = 0;
let testCount = 0;

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n=== Running ${test.name} ===`);
    const proc = spawn(test.cmd, test.args);
    
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      // Parse results
      const testLines = (stdout + stderr).split('\n');
      let testsPassed = 0;
      let testsFailed = 0;
      let testsSkipped = 0;

      testLines.forEach(line => {
        const match = line.match(/Tests:\s+(\d+)\s+failed.*?(\d+)\s+passed/);
        const match2 = line.match(/Tests:\s+(\d+)\s+passed/);
        const match3 = line.match(/(\d+)\s+skipped/);

        if (match) {
          testsFailed = parseInt(match[1]);
          testsPassed = parseInt(match[2]);
        } else if (match2) {
          testsPassed = parseInt(match2[1]);
        }
        if (match3) {
          testsSkipped = parseInt(match3[1]);
        }
      });

      results[test.name] = {
        passed: testsPassed,
        failed: testsFailed,
        skipped: testsSkipped,
        exitCode: code,
        status: code === 0 ? 'PASS' : 'FAIL',
      };

      passed += testsPassed;
      failed += testsFailed;
      testCount += testsPassed + testsFailed + testsSkipped;

      console.log(`\n${test.name}: ${results[test.name].status}`);
      console.log(`  Passed: ${testsPassed}, Failed: ${testsFailed}, Skipped: ${testsSkipped}`);

      resolve();
    });
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        COMPREHENSIVE TEST SUITE EXECUTION                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  for (const test of tests) {
    await runTest(test);
  }

  // Generate report
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL TEST REPORT                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  let allPassed = true;
  Object.entries(results).forEach(([name, result]) => {
    console.log(`\n${name}:`);
    console.log(`  Status: ${result.status === 'PASS' ? '✅' : '❌'} ${result.status}`);
    console.log(`  Passed: ${result.passed}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Skipped: ${result.skipped}`);
    if (result.failed > 0) allPassed = false;
  });

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`Total Tests: ${testCount}`);
  console.log(`Total Passed: ${passed}`);
  console.log(`Total Failed: ${failed}`);
  console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);
  console.log(`\nProduction Ready: ${allPassed && failed === 0 ? '✅ YES' : '❌ NO'}`);
  console.log(`\n${allPassed && failed === 0 ? '🚀 SYSTEM IS PRODUCTION-READY!' : '⚠️ FIX FAILURES BEFORE PRODUCTION'}`);

  process.exit(allPassed && failed === 0 ? 0 : 1);
}

main();
