/**
 * Acceptance test for "Build me a calculator" request
 * Tests Stages 1-2: Analyze and Plan
 */

import { Agent } from '@eitherway/runtime';
import { ConfigLoader } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';

interface EvalResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
  }>;
  transcript?: any;
}

/**
 * Run calculator evaluation
 */
export async function runCalculatorEval(dryRun: boolean = true): Promise<EvalResult> {
  const request = 'Build me a calculator';

  try {
    // Load config
    const loader = new ConfigLoader('./configs');
    const { claudeConfig, agentConfig } = await loader.loadAll();

    // Create agent in dry-run mode
    const agent = new Agent({
      workingDir: process.cwd(),
      claudeConfig,
      agentConfig,
      executors: getAllExecutors(),
      dryRun
    });

    // Process request
    const response = await agent.processRequest(request);
    // const transcript = agent.getCurrentTranscript(); // TODO: Implement transcript getter

    // Evaluation checks
    const checks = [];

    // Check 1: Agent produces a response
    checks.push({
      name: 'Agent produces response',
      passed: response.length > 0,
      details: `Response length: ${response.length} characters`
    });

    // Check 2: Response contains analysis (Stage 1)
    const hasAnalysis =
      response.toLowerCase().includes('calculator') &&
      (response.toLowerCase().includes('intent') ||
       response.toLowerCase().includes('scope') ||
       response.toLowerCase().includes('requirement'));

    checks.push({
      name: 'Stage 1: Contains analysis of request',
      passed: hasAnalysis,
      details: hasAnalysis ? 'Found analysis keywords' : 'Missing analysis indicators'
    });

    // Check 3: Response contains architecture plan (Stage 2)
    const hasPlan =
      (response.toLowerCase().includes('component') ||
       response.toLowerCase().includes('file') ||
       response.toLowerCase().includes('design')) &&
      (response.toLowerCase().includes('structure') ||
       response.toLowerCase().includes('architecture'));

    checks.push({
      name: 'Stage 2: Contains architecture plan',
      passed: hasPlan,
      details: hasPlan ? 'Found architecture planning' : 'Missing architecture plan'
    });

    // Check 4: Response mentions expected features
    const mentionsUI = response.toLowerCase().includes('ui') ||
                       response.toLowerCase().includes('interface') ||
                       response.toLowerCase().includes('button');

    checks.push({
      name: 'Identifies UI requirements',
      passed: mentionsUI,
      details: mentionsUI ? 'UI mentioned' : 'UI not explicitly mentioned'
    });

    // Check 5: Response mentions operations/logic
    const mentionsLogic = response.toLowerCase().includes('operation') ||
                          response.toLowerCase().includes('calculation') ||
                          response.toLowerCase().includes('arithmetic');

    checks.push({
      name: 'Identifies calculator operations',
      passed: mentionsLogic,
      details: mentionsLogic ? 'Operations mentioned' : 'Operations not mentioned'
    });

    // Check 6: In dry-run mode, no files should be created
    if (dryRun) {
      const noToolExecution = !response.includes('Successfully wrote') &&
                              !response.includes('Successfully replaced');
      checks.push({
        name: 'Dry run: No file modifications',
        passed: noToolExecution,
        details: noToolExecution ? 'No files modified' : 'Files were modified in dry-run mode'
      });
    }

    const allPassed = checks.every(c => c.passed);

    return {
      passed: allPassed,
      checks
    };

  } catch (error: any) {
    return {
      passed: false,
      checks: [
        {
          name: 'Execution',
          passed: false,
          details: `Error: ${error.message}`
        }
      ]
    };
  }
}

