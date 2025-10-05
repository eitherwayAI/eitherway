/**
 * @eitherway/tools-impl - Tool executor implementations
 */

export { EitherViewExecutor } from './either-view.js';
export { EitherSearchFilesExecutor } from './either-search-files.js';
export { EitherWriteExecutor } from './either-write.js';
export { EitherLineReplaceExecutor } from './either-line-replace.js';
export { ImageGenExecutor } from './imagegen.js';
export { SecurityGuard } from './security.js';

import { EitherViewExecutor } from './either-view.js';
import { EitherSearchFilesExecutor } from './either-search-files.js';
import { EitherWriteExecutor } from './either-write.js';
import { EitherLineReplaceExecutor } from './either-line-replace.js';
import { ImageGenExecutor } from './imagegen.js';
import type { ToolExecutor } from '@eitherway/tools-core';

/**
 * Get all tool executors
 */
export function getAllExecutors(): ToolExecutor[] {
  return [
    new EitherViewExecutor(),
    new EitherSearchFilesExecutor(),
    new EitherWriteExecutor(),
    new EitherLineReplaceExecutor(),
    new ImageGenExecutor()
  ];
}
