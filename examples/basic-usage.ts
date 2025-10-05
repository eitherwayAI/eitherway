/**
 * Basic usage example for EitherWay Agent
 */

import { Agent, ConfigLoader } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';

async function main() {
  // Load configuration
  const loader = new ConfigLoader('./configs');
  const { claudeConfig, agentConfig } = await loader.loadAll();

  // Create agent
  const agent = new Agent({
    workingDir: process.cwd(),
    claudeConfig,
    agentConfig,
    executors: getAllExecutors(),
    dryRun: false // Set to true for dry-run mode
  });

  // Process a request
  const response = await agent.processRequest(
    'Build me a simple calculator with addition and subtraction'
  );

  console.log('Response:', response);

  // Save transcript
  await agent.saveTranscript();
}

main().catch(console.error);
