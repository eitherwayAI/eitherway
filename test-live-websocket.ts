/**
 * Test the LIVE WebSocket endpoint to reproduce the exact error
 */

import WebSocket from 'ws';

async function main() {
  console.log('='.repeat(80));
  console.log('LIVE WEBSOCKET TEST - Connecting to running server');
  console.log('='.repeat(80));

  const ws = new WebSocket('ws://localhost:3001/api/agent');

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log('✅ Connected to ws://localhost:3001/api/agent\n');
      resolve();
    });

    ws.on('error', (error) => {
      console.error('❌ Connection error:', error.message);
      reject(error);
    });

    setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);
  });

  const messages: any[] = [];
  let errorOccurred = false;

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    messages.push(message);

    console.log(`\n📨 [${message.type}]`);

    if (message.type === 'status') {
      console.log(`   Status: ${message.message}`);
    }

    if (message.type === 'error') {
      console.log(`   ❌ ERROR: ${message.message}`);
      errorOccurred = true;

      if (message.message.includes('web_search') && message.message.includes('tool_use_id')) {
        console.log('\n🔍 THIS IS THE BUG!');
        console.log('   The server is sending a malformed conversation history to Claude.');
        console.log('   The validation we added should have caught this BEFORE calling Claude.');
      }
    }

    if (message.type === 'response') {
      console.log(`   ✅ Response received (${message.content.length} chars)`);
      console.log(`   Preview: ${message.content.substring(0, 100)}...`);
    }

    if (message.type === 'files_updated') {
      console.log(`   📁 Files updated: ${message.files?.length || 0} files`);
    }
  });

  // Send a prompt that should trigger web_search
  const prompt = 'Create a simple todo app. Research modern UI design trends for 2025 and apply them.';

  console.log('\n' + '='.repeat(80));
  console.log('SENDING PROMPT:');
  console.log('='.repeat(80));
  console.log(`"${prompt}"\n`);

  ws.send(JSON.stringify({
    type: 'prompt',
    prompt
  }));

  // Wait for completion or error (max 3 minutes)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n⏱️  Timeout after 3 minutes');
      resolve();
    }, 180000);

    const checkInterval = setInterval(() => {
      const hasResponse = messages.some(m => m.type === 'response');
      const hasError = messages.some(m => m.type === 'error');

      if (hasResponse || hasError) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY:');
  console.log('='.repeat(80));
  console.log(`Total messages: ${messages.length}`);
  console.log(`  - status: ${messages.filter(m => m.type === 'status').length}`);
  console.log(`  - response: ${messages.filter(m => m.type === 'response').length}`);
  console.log(`  - error: ${messages.filter(m => m.type === 'error').length}`);
  console.log(`  - files_updated: ${messages.filter(m => m.type === 'files_updated').length}`);

  ws.close();

  if (errorOccurred) {
    console.log('\n❌ TEST FAILED - Error occurred');
    console.log('\nError messages:');
    messages.filter(m => m.type === 'error').forEach((msg, idx) => {
      console.log(`\nError ${idx + 1}:`);
      console.log(msg.message);
    });
    process.exit(1);
  } else {
    console.log('\n✅ TEST PASSED - No errors');
  }
}

main().catch((error) => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});
