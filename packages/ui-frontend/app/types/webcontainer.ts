/**
 * Type definitions for WebContainer API
 */

import type { WebContainer } from '@webcontainer/api';

/**
 * WebContainer process returned by spawn()
 */
export interface WebContainerProcess {
  exit: Promise<number>;
  output: ReadableStream<string>;
  kill: () => void;
}

/**
 * Extended WebContainer with undocumented origin properties
 * (used for manual preview registration fallback)
 */
export interface ExtendedWebContainer extends WebContainer {
  origin?: string;
  serverOrigin?: string;
}
