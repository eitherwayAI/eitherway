/**
 * Utility functions for brand kit handling
 */

/**
 * Strips brand kit context from message content
 * Brand kit context is prepended by the backend and starts with "\n\nBRAND KIT AVAILABLE:"
 * We want to hide this from the user in message displays and history previews
 */
export function stripBrandKitContext(content: string): string {
  if (!content) return content;

  // Match the brand kit context pattern:
  // Starts with optional whitespace, then "BRAND KIT AVAILABLE:", continues until the original user prompt
  // The original prompt starts after the brand kit instructions end
  const brandKitPattern = /^\s*BRAND KIT AVAILABLE:[\s\S]*?IMPORTANT:.*?\n\n/;

  const stripped = content.replace(brandKitPattern, '');

  return stripped;
}
