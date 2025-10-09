import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerURL');

/**
 * Determines if we're running in a real WebContainer environment (StackBlitz/eitherway)
 * or in local development
 */
export function isWebContainerEnvironment(): boolean {
  // Check for WebContainer-specific environment indicators
  if (typeof window === 'undefined') {
    return false;
  }

  // WebContainer sets specific globals
  const hasWebContainerGlobal = 'WebContainer' in window;

  // Check if we're in StackBlitz or similar environment
  const isStackBlitz =
    window.location.hostname.includes('stackblitz') || window.location.hostname.includes('webcontainer');

  // Check for WebContainer-specific iframe embedding
  const isEmbedded = window.parent !== window;

  // In production Eitherway, we should be in WebContainer environment
  const isProduction = window.location.hostname.includes('eitherway');

  return hasWebContainerGlobal || isStackBlitz || isProduction;
}

/**
 * Transforms a URL based on the environment
 * In WebContainer: Uses the provided URL (should be https://[id].webcontainerapp.io)
 * In local dev: Transforms localhost to work properly
 */
export function transformPreviewUrl(url: string, port: number): string {
  if (!url) {
    logger.warn('No URL provided for transformation');
    return '';
  }

  // If we're in a real WebContainer environment, use the URL as-is
  if (isWebContainerEnvironment()) {
    logger.info(`WebContainer environment detected, using URL: ${url}`);
    return url;
  }

  // In local development, WebContainer might still provide localhost URLs
  // We need to ensure they work properly
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // For local development, ensure the URL is accessible
    // WebContainer in local dev runs on the same machine
    const localUrl = `http://localhost:${port}`;
    logger.info(`Local development detected, using: ${localUrl}`);

    return localUrl;
  }

  // If it's already a WebContainer URL, use it as-is
  if (url.includes('webcontainerapp.io') || url.includes('webcontainer.io')) {
    logger.info(`WebContainer URL detected: ${url}`);
    return url;
  }

  // Default: use the URL as provided
  logger.info(`Using URL as provided: ${url}`);

  return url;
}

/**
 * Validates if a preview URL is ready and accessible
 */
export async function validatePreviewUrl(url: string): Promise<boolean> {
  if (!url) {
    return false;
  }

  try {
    // Try to fetch with a short timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // In no-cors mode, we can't read the response but if it doesn't throw, it's likely accessible
    logger.info(`Preview URL validated: ${url}`);

    return true;
  } catch (error) {
    logger.warn(`Preview URL not ready yet: ${url}`);
    return false;
  }
}

/**
 * Gets the appropriate preview URL for the current environment
 */
export function getPreviewUrl(baseUrl: string, port: number): string {
  const transformedUrl = transformPreviewUrl(baseUrl, port);

  // Log the transformation for debugging
  if (baseUrl !== transformedUrl) {
    logger.info(`URL transformed: ${baseUrl} -> ${transformedUrl}`);
  }

  return transformedUrl;
}
