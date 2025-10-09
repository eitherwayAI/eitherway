import { webcontainer } from './index';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerDebug');

export async function debugWebContainer() {
  try {
    const wc = await webcontainer;
    
    // Log WebContainer readiness
    logger.info('WebContainer initialized successfully');
    
    // Listen to all port events for debugging
    wc.on('port', (port, type, url) => {
      logger.info(`🔌 Port Event Debug:`, {
        port,
        type,
        url,
        timestamp: new Date().toISOString()
      });
      
      // Check if URL is localhost and warn
      if (url.includes('localhost')) {
        logger.warn(`⚠️ Localhost URL detected: ${url}`);
        logger.warn('WebContainer should provide a unique URL like https://[id].webcontainerapp.io');
      } else {
        logger.info(`✅ WebContainer URL: ${url}`);
      }
    });
    
    // Listen to server ready events
    wc.on('server-ready', (port, url) => {
      logger.info(`🚀 Server Ready - Port: ${port}, URL: ${url}`);
    });
    
    // Check WebContainer's current state
    const fs = wc.fs;
    const processes = typeof wc.spawn !== 'undefined' ? 'Available' : 'Not Available';
    
    logger.info('WebContainer Capabilities:', {
      fileSystem: fs ? 'Ready' : 'Not Ready',
      processes,
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown'
    });
    
  } catch (error) {
    logger.error('Failed to debug WebContainer:', error);
  }
}

// Initialize debugging
if (typeof window !== 'undefined') {
  debugWebContainer();
}