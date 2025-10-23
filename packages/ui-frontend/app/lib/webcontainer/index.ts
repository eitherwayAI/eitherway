import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';
import { validateSessionOperation } from '~/lib/stores/sessionContext';

const logger = createScopedLogger('WebContainer');

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

let webcontainerInstance: WebContainer | null = null;

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(() => {
        return WebContainer.boot({ workdirName: WORK_DIR_NAME });
      })
      .then((wc) => {
        webcontainerContext.loaded = true;
        webcontainerInstance = wc;

        logger.info('✅ WebContainer booted successfully');

        return wc;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}

/**
 * Tear down WebContainer completely and reset state
 * Call this when starting a new conversation to ensure clean state
 */
export async function tearDownWebContainer(): Promise<void> {
  if (!webcontainerInstance) {
    logger.debug('No WebContainer instance to tear down');
    return;
  }

  try {
    logger.info('🔄 Tearing down WebContainer...');
    await webcontainerInstance.teardown();
    webcontainerInstance = null;
    webcontainerContext.loaded = false;
    logger.info('✅ WebContainer torn down successfully');
  } catch (error) {
    logger.error('Error tearing down WebContainer:', error);
    // Force reset even if teardown fails
    webcontainerInstance = null;
    webcontainerContext.loaded = false;
  }
}

/**
 * Reboot WebContainer after teardown
 * Creates a fresh instance for new conversation
 */
export async function rebootWebContainer(): Promise<WebContainer> {
  if (!import.meta.env.SSR) {
    logger.info('🔄 Rebooting WebContainer...');
    const wc = await WebContainer.boot({ workdirName: WORK_DIR_NAME });
    webcontainerInstance = wc;
    webcontainerContext.loaded = true;
    webcontainer = Promise.resolve(wc);
    logger.info('✅ WebContainer rebooted successfully');
    return wc;
  }
  throw new Error('Cannot reboot WebContainer in SSR mode');
}

/**
 * Get the WebContainer instance with session validation
 * Use this for operations that require an active session
 */
export async function getWebContainer(): Promise<WebContainer> {
  validateSessionOperation('access WebContainer');
  return await webcontainer;
}

/**
 * Get the WebContainer instance without validation (for internal use)
 * Use this for system-level operations that don't require session context
 */
export async function getWebContainerUnsafe(): Promise<WebContainer> {
  return await webcontainer;
}
