/**
 * Rate limiting for external API calls
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: Map<string, number[]>;
  private config: Map<string, RateLimitConfig>;

  constructor() {
    this.requests = new Map();
    this.config = new Map();

    // Default rate limits
    this.setLimit('websearch', { maxRequests: 10, windowMs: 60000 }); // 10 per minute
    this.setLimit('eithergen', { maxRequests: 5, windowMs: 60000 });  // 5 per minute
  }

  /**
   * Set rate limit for a specific tool
   */
  setLimit(tool: string, config: RateLimitConfig): void {
    this.config.set(tool, config);
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(tool: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const config = this.config.get(tool);
    if (!config) {
      // No rate limit configured
      return { allowed: true };
    }

    const now = Date.now();
    const requests = this.requests.get(tool) || [];

    // Remove expired requests
    const validRequests = requests.filter(time => now - time < config.windowMs);

    if (validRequests.length >= config.maxRequests) {
      // Rate limit exceeded
      const oldestRequest = validRequests[0];
      const retryAfter = Math.ceil((oldestRequest + config.windowMs - now) / 1000);

      return {
        allowed: false,
        retryAfter
      };
    }

    // Record this request
    validRequests.push(now);
    this.requests.set(tool, validRequests);

    return { allowed: true };
  }

  /**
   * Reset rate limit for a tool
   */
  reset(tool: string): void {
    this.requests.delete(tool);
  }

  /**
   * Get current usage
   */
  getUsage(tool: string): { current: number; max: number; windowMs: number } | null {
    const config = this.config.get(tool);
    if (!config) return null;

    const now = Date.now();
    const requests = this.requests.get(tool) || [];
    const validRequests = requests.filter(time => now - time < config.windowMs);

    return {
      current: validRequests.length,
      max: config.maxRequests,
      windowMs: config.windowMs
    };
  }
}
