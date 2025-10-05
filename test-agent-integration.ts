/**
 * Integration test that simulates the exact agent flow
 * Tests multi-turn conversation with both server-side and client-side tools
 */

import { Agent } from './packages/runtime/src/agent.js';
import { getAllExecutors } from './packages/tools-impl/src/index.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function main() {
  console.log('='.repeat(80));
  console.log('INTEGRATION TEST: Agent with web_search + client-side tools');
  console.log('='.repeat(80));

  // Load configs
  const claudeConfig = JSON.parse(
    await readFile('./configs/anthropic.json', 'utf-8')
  );
  const agentConfig = JSON.parse(
    await readFile('./configs/agent.json', 'utf-8')
  );

  // Create agent
  const agent = new Agent({
    workingDir: './workspace',
    claudeConfig,
    agentConfig,
    executors: getAllExecutors(),
    dryRun: false,
    webSearch: {
      enabled: true,
      maxUses: 3
    }
  });

  console.log('\n✅ Agent created');
  console.log(`Working directory: ./workspace`);
  console.log(`Web search: enabled (max 3 uses)`);

  // Test 1: Simple prompt that should trigger web_search
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Prompt that triggers web_search');
  console.log('='.repeat(80));

  const prompt1 = 'What are the latest web development trends in 2025? Create a simple HTML page listing them.';
  console.log(`\nPrompt: "${prompt1}"\n`);

  try {
    const response1 = await agent.processRequest(prompt1);
    console.log('\n✅ Request completed successfully');
    console.log(`\nResponse (first 500 chars):\n${response1.substring(0, 500)}...\n`);

    // Get conversation history
    const history = agent.getHistory();
    console.log('\n' + '-'.repeat(80));
    console.log('CONVERSATION HISTORY:');
    console.log('-'.repeat(80));

    history.forEach((msg, idx) => {
      console.log(`\n[${idx}] ${msg.role.toUpperCase()}`);
      if (typeof msg.content === 'string') {
        console.log(`  Content (string): ${msg.content.substring(0, 100)}...`);
      } else if (Array.isArray(msg.content)) {
        console.log(`  Content (${msg.content.length} blocks):`);
        msg.content.forEach((block: any, blockIdx: number) => {
          console.log(`    [${blockIdx}] type: ${block.type}`);
          if (block.type === 'server_tool_use') {
            console.log(`        id: ${block.id}`);
            console.log(`        name: ${block.name}`);
          }
          if (block.type === 'web_search_tool_result') {
            console.log(`        tool_use_id: ${block.tool_use_id}`);
            console.log(`        content: ${JSON.stringify(block.content).substring(0, 100)}...`);
          }
          if (block.type === 'tool_use') {
            console.log(`        id: ${block.id}`);
            console.log(`        name: ${block.name}`);
          }
          if (block.type === 'tool_result') {
            console.log(`        tool_use_id: ${block.tool_use_id}`);
          }
        });
      }
    });

    // Validate that server_tool_use is paired with web_search_tool_result
    console.log('\n' + '-'.repeat(80));
    console.log('VALIDATION:');
    console.log('-'.repeat(80));

    let hasError = false;

    history.forEach((msg, idx) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const serverToolUses = msg.content.filter((b: any) => b.type === 'server_tool_use');
        const webSearchResults = msg.content.filter((b: any) => b.type === 'web_search_tool_result');

        console.log(`\nMessage [${idx}]:`);
        console.log(`  server_tool_use blocks: ${serverToolUses.length}`);
        console.log(`  web_search_tool_result blocks: ${webSearchResults.length}`);

        if (serverToolUses.length > 0 && webSearchResults.length === 0) {
          console.log(`  ❌ ERROR: Has server_tool_use but NO web_search_tool_result!`);
          hasError = true;
        } else if (serverToolUses.length === webSearchResults.length) {
          console.log(`  ✅ OK: Paired correctly`);

          // Verify IDs match
          serverToolUses.forEach((stu: any) => {
            const matchingResult = webSearchResults.find((wsr: any) => wsr.tool_use_id === stu.id);
            if (matchingResult) {
              console.log(`     ✅ server_tool_use ${stu.id} → web_search_tool_result found`);
            } else {
              console.log(`     ❌ server_tool_use ${stu.id} → NO matching web_search_tool_result!`);
              hasError = true;
            }
          });
        } else if (serverToolUses.length > 0) {
          console.log(`  ⚠️  WARNING: Mismatch in counts`);
        }
      }
    });

    if (hasError) {
      console.log('\n❌ VALIDATION FAILED: Conversation history is malformed!');
      console.log('This would cause the error we\'re seeing in production.');
      process.exit(1);
    } else {
      console.log('\n✅ VALIDATION PASSED: Conversation history is correctly formed.');
    }

  } catch (error: any) {
    console.log('\n❌ REQUEST FAILED');
    console.log(`Error: ${error.message}`);

    if (error.message.includes('web_search') && error.message.includes('tool_use_id')) {
      console.log('\n🔍 This is the exact error we\'re trying to fix!');
      console.log('The conversation history has server_tool_use without web_search_tool_result.');
    }

    // Get history even on failure
    const history = agent.getHistory();
    console.log('\nConversation history at time of error:');
    console.log(JSON.stringify(history, null, 2));

    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ ALL TESTS PASSED');
  console.log('='.repeat(80));
}

main().catch(console.error);
