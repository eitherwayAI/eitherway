/**
 * Test the exact WebSocket scenario that's failing in production
 */

import WebSocket from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

async function main() {
  console.log('='.repeat(80));
  console.log('WEBSOCKET END-TO-END TEST');
  console.log('='.repeat(80));

  // Start the server
  console.log('\n📡 Starting server...');
  const serverProcess: ChildProcess = spawn('npm', ['run', 'server'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  let serverReady = false;

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 30 seconds'));
    }, 30000);

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[server]', output.trim());

      if (output.includes('running on') || output.includes('localhost:3001')) {
        serverReady = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('[server error]', data.toString().trim());
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  console.log('✅ Server is ready\n');

  // Give it a bit more time to fully initialize
  await sleep(2000);

  // Connect WebSocket
  console.log('🔌 Connecting WebSocket...');
  const ws = new WebSocket('ws://localhost:3001/api/agent');

  await new Promise<void>((resolve) => {
    ws.on('open', () => {
      console.log('✅ WebSocket connected\n');
      resolve();
    });
  });

  // Set up message handler
  const messages: any[] = [];

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    messages.push(message);

    console.log(`📨 Received: ${message.type}`);
    if (message.type === 'error') {
      console.log(`   ❌ Error: ${message.message}`);
    }
    if (message.type === 'response') {
      console.log(`   ✅ Response: ${message.content.substring(0, 100)}...`);
    }
  });

  // Test 1: Send a prompt that should use web_search
  console.log('='.repeat(80));
  console.log('TEST 1: Prompt with web_search');
  console.log('='.repeat(80));

  const prompt1 = 'Build a simple calculator app. Research the latest UI design trends for 2025 and apply them.';
  console.log(`\nSending: "${prompt1}"\n`);

  ws.send(JSON.stringify({
    type: 'prompt',
    prompt: prompt1
  }));

  // Wait for response (give it 2 minutes max)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n⚠️  Timeout waiting for response');
      resolve();
    }, 120000);

    const interval = setInterval(() => {
      const hasResponse = messages.some(m => m.type === 'response' || m.type === 'error');
      if (hasResponse) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  // Check results
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS:');
  console.log('='.repeat(80));

  const errorMessages = messages.filter(m => m.type === 'error');
  const responseMessages = messages.filter(m => m.type === 'response');

  console.log(`\nTotal messages received: ${messages.length}`);
  console.log(`  - status: ${messages.filter(m => m.type === 'status').length}`);
  console.log(`  - response: ${responseMessages.length}`);
  console.log(`  - error: ${errorMessages.length}`);
  console.log(`  - files_updated: ${messages.filter(m => m.type === 'files_updated').length}`);

  if (errorMessages.length > 0) {
    console.log('\n❌ ERRORS DETECTED:');
    errorMessages.forEach((msg, idx) => {
      console.log(`\nError ${idx + 1}:`);
      console.log(msg.message);

      if (msg.message.includes('web_search') && msg.message.includes('tool_use_id')) {
        console.log('\n🔍 THIS IS THE BUG WE\'RE TRYING TO FIX!');
        console.log('The conversation history has server_tool_use without web_search_tool_result.');
      }
    });

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    ws.close();
    serverProcess.kill();
    await sleep(1000);

    console.log('\n❌ TEST FAILED');
    process.exit(1);
  }

  if (responseMessages.length === 0) {
    console.log('\n⚠️  No response received');

    // Cleanup
    ws.close();
    serverProcess.kill();
    await sleep(1000);

    console.log('\n❌ TEST FAILED');
    process.exit(1);
  }

  console.log('\n✅ Request completed successfully!');
  console.log('\nResponse preview:');
  console.log(responseMessages[0].content.substring(0, 500));

  // Test 2: Send another message to test multi-turn (if applicable)
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Follow-up message');
  console.log('='.repeat(80));

  messages.length = 0; // Clear messages array

  const prompt2 = 'Make it colorful with gradients.';
  console.log(`\nSending: "${prompt2}"\n`);

  ws.send(JSON.stringify({
    type: 'prompt',
    prompt: prompt2
  }));

  // Wait for response
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n⚠️  Timeout waiting for response');
      resolve();
    }, 120000);

    const interval = setInterval(() => {
      const hasResponse = messages.some(m => m.type === 'response' || m.type === 'error');
      if (hasResponse) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  const errorMessages2 = messages.filter(m => m.type === 'error');
  const responseMessages2 = messages.filter(m => m.type === 'response');

  if (errorMessages2.length > 0) {
    console.log('\n❌ ERRORS ON SECOND REQUEST:');
    errorMessages2.forEach((msg) => {
      console.log(msg.message);
    });
  } else if (responseMessages2.length > 0) {
    console.log('\n✅ Second request completed successfully!');
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  ws.close();
  serverProcess.kill();
  await sleep(1000);

  if (errorMessages2.length > 0) {
    console.log('\n❌ TEST FAILED ON SECOND REQUEST');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ ALL TESTS PASSED');
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
