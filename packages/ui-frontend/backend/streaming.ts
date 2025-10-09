/**
 * Minimal streaming utilities
 * Stripped from robust backend - no AI, no DB, just pure streaming
 */

const LOREM_TEXT = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

export interface StreamOptions {
  chunkSize?: number;
  delayMs?: number;
  text?: string;
}

/**
 * Async generator for streaming text chunks
 * Mimics the RequirementsExtractor.streamSuggestions pattern from robust backend
 */
export async function* streamLoremChunks(options: StreamOptions = {}): AsyncGenerator<string, void, unknown> {
  const {
    chunkSize = 20,
    delayMs = 300,
    text = LOREM_TEXT
  } = options;

  // Split text into chunks
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    yield chunk;

    // Simulate processing delay
    if (i + chunkSize < text.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Agent simulation: Input → Output streaming
 * Replaces complex @openai/agents SDK with simple async generator
 */
export async function* streamAgentResponse(prompt: string, options: StreamOptions = {}): AsyncGenerator<any, void, unknown> {
  // Phase 1: Yield initial acknowledgment
  yield {
    type: 'start',
    prompt,
    timestamp: new Date().toISOString()
  };

  await new Promise(resolve => setTimeout(resolve, 500));

  // Phase 2: Stream response chunks
  const responseText = `[Agent processing: "${prompt}"]\n\n${options.text || LOREM_TEXT}`;

  for await (const chunk of streamLoremChunks({ ...options, text: responseText })) {
    yield {
      type: 'chunk',
      data: chunk,
      timestamp: new Date().toISOString()
    };
  }

  // Phase 3: Completion event
  yield {
    type: 'complete',
    prompt,
    timestamp: new Date().toISOString()
  };
}

/**
 * SSE (Server-Sent Events) formatter
 * Converts data to SSE format: "data: {json}\n\n"
 */
export function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
