#!/usr/bin/env node
/**
 * Evaluation runner for Portion 1 acceptance tests
 */

import { runCalculatorEval } from './calculator-eval.js';

async function main() {
  console.log('=== Portion 1 Acceptance Tests ===\n');

  // Test 1: Calculator evaluation
  console.log('Test 1: Calculator Request (Dry Run)');
  console.log('Request: "Build me a calculator"');
  console.log('Expected: Analyze and Plan stages complete\n');

  const result = await runCalculatorEval(true);

  console.log('Results:');
  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}`);
    if (check.details) {
      console.log(`     ${check.details}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Overall: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(50) + '\n');

  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
