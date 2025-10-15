/**
 * Streaming client for Fastify SSE backend
 * Connects to /api/stream-test endpoint and processes Server-Sent Events
 */

export interface StreamOptions {
  prompt: string;
  chunkSize?: number;
  delayMs?: number;
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export interface StreamController {
  abort: () => void;
}

const BACKEND_URL = typeof window !== 'undefined' ? 'http://localhost:4000' : 'http://localhost:4000';

/**
 * Stream from Fastify backend using fetch + ReadableStream
 * POST to /api/stream-test with JSON body
 */
export async function streamFromFastify(options: StreamOptions): Promise<StreamController> {
  const { prompt, chunkSize = 20, delayMs = 150, onChunk, onComplete, onError } = options;

  let aborted = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const abort = () => {
    aborted = true;
    if (reader) {
      reader.cancel();
    }
  };

  try {
    const response = await fetch(`${BACKEND_URL}/api/stream-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        chunkSize,
        delayMs,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!aborted) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.substring(6); // Remove "data: " prefix
            const data = JSON.parse(jsonStr);

            if (data.type === 'start') {
              // Agent started
              continue;
            } else if (data.type === 'chunk') {
              onChunk(data.data);
            } else if (data.type === 'complete') {
              onComplete();
              return { abort };
            } else if (data.type === 'error') {
              onError(data.error || 'Unknown error');
              return { abort };
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }
      }
    }

    if (aborted) {
      onError('Stream aborted by user');
    }
  } catch (error) {
    if (!aborted) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onError(errorMessage);
    }
  }

  return { abort };
}
