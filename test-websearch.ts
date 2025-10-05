/**
 * Standalone test for web_search tool handling
 * Tests the exact flow that's failing in production
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';

async function main() {
  // Load API key
  const configPath = './configs/anthropic.json';
  const config = JSON.parse(await readFile(configPath, 'utf-8'));

  const client = new Anthropic({
    apiKey: config.apiKey
  });

  console.log('='.repeat(80));
  console.log('TEST 1: Single turn with web_search - inspect response structure');
  console.log('='.repeat(80));

const messages: any[] = [
  {
    role: 'user',
    content: 'What is the latest news about Claude AI? Use web search.'
  }
];

const params: Anthropic.MessageCreateParams = {
  model: config.model,
  max_tokens: 2000,
  messages,
  tools: [
    {
      type: 'web_search_20250305' as any,
      name: 'web_search',
      max_uses: 3
    }
  ]
};

console.log('\n📤 Sending request with web_search tool enabled...\n');

const stream = await client.messages.create({
  ...params,
  stream: true
});

const contentBlocks: any[] = [];
let currentTextBlock = '';
let currentToolUse: any = null;
let messageId = '';
let stopReason: string | null = null;

console.log('📥 Streaming events:\n');

for await (const event of stream) {
  console.log(`Event: ${event.type}`, JSON.stringify(event, null, 2).substring(0, 200));

  switch (event.type) {
    case 'message_start':
      messageId = event.message.id;
      console.log(`  → Message ID: ${messageId}`);
      break;

    case 'content_block_start':
      const blockType = (event.content_block as any).type;
      console.log(`  → Content block started: ${blockType}`);

      if (event.content_block.type === 'text') {
        currentTextBlock = '';
      } else if (event.content_block.type === 'tool_use') {
        currentToolUse = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          inputJson: ''
        };
      } else if ((event.content_block as any).type === 'server_tool_use') {
        console.log(`  → 🔍 SERVER_TOOL_USE detected!`);
        console.log(`     ID: ${(event.content_block as any).id}`);
        console.log(`     Name: ${(event.content_block as any).name}`);
        currentToolUse = {
          type: 'server_tool_use',
          id: (event.content_block as any).id,
          name: (event.content_block as any).name,
          inputJson: ''
        };
      } else if ((event.content_block as any).type === 'web_search_tool_result') {
        console.log(`  → ✅ WEB_SEARCH_TOOL_RESULT detected!`);
        console.log(`     Tool Use ID: ${(event.content_block as any).tool_use_id}`);
        console.log(`     Content: ${JSON.stringify((event.content_block as any).content).substring(0, 100)}...`);
        contentBlocks.push({
          type: 'web_search_tool_result',
          tool_use_id: (event.content_block as any).tool_use_id,
          content: (event.content_block as any).content
        });
      }
      break;

    case 'content_block_delta':
      if (event.delta.type === 'text_delta') {
        currentTextBlock += event.delta.text;
      } else if (event.delta.type === 'input_json_delta') {
        if (currentToolUse) {
          currentToolUse.inputJson += event.delta.partial_json;
        }
      }
      break;

    case 'content_block_stop':
      console.log(`  → Content block stopped`);
      if (currentTextBlock) {
        contentBlocks.push({ type: 'text', text: currentTextBlock });
        console.log(`     Pushed text block (${currentTextBlock.length} chars)`);
        currentTextBlock = '';
      } else if (currentToolUse) {
        try {
          currentToolUse.input = JSON.parse(currentToolUse.inputJson || '{}');
        } catch (e) {
          currentToolUse.input = {};
        }
        delete currentToolUse.inputJson;
        contentBlocks.push(currentToolUse);
        console.log(`     Pushed ${currentToolUse.type}: ${currentToolUse.name}`);
        currentToolUse = null;
      }
      break;

    case 'message_delta':
      if (event.delta.stop_reason) {
        stopReason = event.delta.stop_reason;
        console.log(`  → Stop reason: ${stopReason}`);
      }
      break;
  }
}

console.log('\n' + '='.repeat(80));
console.log('RESPONSE CONTENT BLOCKS:');
console.log('='.repeat(80));
console.log(JSON.stringify(contentBlocks, null, 2));

console.log('\n' + '='.repeat(80));
console.log('CONTENT BLOCK TYPES:');
console.log('='.repeat(80));
contentBlocks.forEach((block, idx) => {
  console.log(`  [${idx}] ${block.type}`);
  if (block.type === 'server_tool_use') {
    console.log(`      ID: ${block.id}, Name: ${block.name}`);
  }
  if (block.type === 'web_search_tool_result') {
    console.log(`      Tool Use ID: ${block.tool_use_id}`);
  }
});

// Verify we have both server_tool_use and web_search_tool_result
const hasServerToolUse = contentBlocks.some(b => b.type === 'server_tool_use');
const hasWebSearchResult = contentBlocks.some(b => b.type === 'web_search_tool_result');

console.log('\n' + '='.repeat(80));
console.log('VALIDATION:');
console.log('='.repeat(80));
console.log(`  Has server_tool_use: ${hasServerToolUse ? '✅' : '❌'}`);
console.log(`  Has web_search_tool_result: ${hasWebSearchResult ? '✅' : '❌'}`);

if (hasServerToolUse && !hasWebSearchResult) {
  console.log('\n⚠️  ERROR: Found server_tool_use without web_search_tool_result!');
  process.exit(1);
}

console.log('\n' + '='.repeat(80));
console.log('TEST 2: Multi-turn conversation - verify Claude accepts the history');
console.log('='.repeat(80));

// Now test sending this back in a multi-turn conversation
const conversationHistory: any[] = [
  {
    role: 'user',
    content: 'What is the latest news about Claude AI? Use web search.'
  },
  {
    role: 'assistant',
    content: contentBlocks
  },
  {
    role: 'user',
    content: 'Thank you. Can you summarize that in one sentence?'
  }
];

console.log('\n📤 Sending multi-turn conversation...\n');
console.log('Conversation history:');
conversationHistory.forEach((msg, idx) => {
  console.log(`  [${idx}] ${msg.role}`);
  if (Array.isArray(msg.content)) {
    msg.content.forEach((block: any) => {
      console.log(`      - ${block.type}`);
    });
  }
});

try {
  const response2 = await client.messages.create({
    model: config.model,
    max_tokens: 500,
    messages: conversationHistory,
    tools: [
      {
        type: 'web_search_20250305' as any,
        name: 'web_search',
        max_uses: 3
      }
    ]
  });

  console.log('\n✅ SUCCESS! Claude accepted the conversation history.');
  console.log(`Response ID: ${response2.id}`);
  console.log(`Stop reason: ${response2.stop_reason}`);

  const textContent = response2.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => (c as any).text)
    .join('\n');

  console.log('\nResponse text:');
  console.log(textContent.substring(0, 200) + '...');

} catch (error: any) {
  console.log('\n❌ FAILED! Claude rejected the conversation history.');
  console.log('Error:', error.message);
  if (error.message.includes('web_search')) {
    console.log('\n🔍 This is the bug we need to fix!');
    console.log('The assistant message is missing web_search_tool_result blocks.');
  }
  process.exit(1);
}

console.log('\n' + '='.repeat(80));
console.log('✅ ALL TESTS PASSED!');
console.log('='.repeat(80));
}

main().catch(console.error);
