/**
 * Agent Runtime Configuration Constants
 */

/**
 * Maximum number of agent turns before forcing termination
 * Prevents infinite loops in agent execution
 */
export const MAX_AGENT_TURNS = 20;

/**
 * Number of reasoning tokens to buffer before streaming to client
 * Smaller chunks = more frequent updates, larger chunks = less network overhead
 */
export const REASONING_STREAM_CHUNK_SIZE = 2;

/**
 * Delay between reasoning stream chunks (milliseconds)
 * ~16ms achieves approximately 60fps for smooth streaming experience
 */
export const REASONING_STREAM_DELAY_MS = 16;
