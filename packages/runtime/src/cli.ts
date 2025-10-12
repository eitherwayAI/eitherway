#!/usr/bin/env node
/**
 * CLI for the EitherWay agent
 */

import { Agent } from './agent.js';
import { ConfigLoader } from './config.js';
import { getAllExecutors } from '@eitherway/tools-impl';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
EitherWay Agent CLI - App creation with Claude Sonnet 4.5

Usage:
  npm run dev [options] "<request>"

Options:
  --dry-run         Show what would be executed without making changes
  --config-dir DIR  Configuration directory (default: ./configs)
  --help, -h        Show this help message

Examples:
  npm run dev "Build me a calculator"
  npm run dev --dry-run "Create a todo app"

Configuration:
  1. Copy configs/anthropic.example.json to configs/anthropic.json
  2. Add your Anthropic API key
  3. Adjust agent.json settings as needed
`);
    process.exit(0);
  }

  let dryRun = false;
  let configDir = './configs';
  let request = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--config-dir') {
      configDir = args[++i];
    } else {
      request = args.slice(i).join(' ');
      break;
    }
  }

  if (!request) {
    console.error('Error: No request provided');
    process.exit(1);
  }

  try {
    const loader = new ConfigLoader(configDir);
    const { claudeConfig, agentConfig } = await loader.loadAll();

    const agent = new Agent({
      workingDir: process.cwd(),
      claudeConfig,
      agentConfig,
      executors: getAllExecutors(),
      dryRun,
      webSearch: agentConfig.tools.webSearch
    });

    console.log('\n=== EitherWay Agent ===');
    console.log(`Model: ${claudeConfig.model}`);
    console.log(`Dry Run: ${dryRun ? 'YES' : 'NO'}`);
    console.log(`Request: ${request}`);
    console.log('======================\n');

    const response = await agent.processRequest(request);

    await agent.saveTranscript();

    console.log('\n======================');
    console.log('Final Response:');
    console.log(response);
    console.log('======================\n');

  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
