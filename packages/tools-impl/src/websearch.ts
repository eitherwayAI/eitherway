/**
 * websearch--web_search: Web search with Claude web_search pattern
 * Supports domain filtering, localization, and usage limits
 */

import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published_at?: string;
}

interface UserLocation {
  type: 'approximate';
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

/**
 * Abstract search provider interface
 */
interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}

interface SearchOptions {
  maxResults: number;
  recencyDays?: number;
  site?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: UserLocation;
}

/**
 * Tavily search provider
 */
class TavilyProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Build search request
    const searchParams: any = {
      query,
      max_results: options.maxResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false
    };

    if (options.site) {
      searchParams.query = `site:${options.site} ${query}`;
    }

    if (options.recencyDays) {
      // Tavily supports time-based filtering
      const date = new Date();
      date.setDate(date.getDate() - options.recencyDays);
      searchParams.days = options.recencyDays;
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          ...searchParams
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return (data.results || []).map((result: any) => ({
        title: result.title || 'No title',
        url: result.url,
        snippet: result.content || result.snippet || '',
        published_at: result.published_date || undefined
      }));
    } catch (error: any) {
      throw new Error(`Tavily search failed: ${error.message}`);
    }
  }
}

/**
 * Fallback/mock provider for testing
 */
class MockProvider implements SearchProvider {
  async search(query: string, _options: SearchOptions): Promise<SearchResult[]> {
    return [
      {
        title: `Mock result for: ${query}`,
        url: 'https://example.com',
        snippet: 'This is a mock search result. Configure a real provider (Tavily) by adding API key to config.'
      }
    ];
  }
}

export class WebSearchExecutor implements ToolExecutor {
  name = 'websearch--web_search';
  private searchCount = 0;
  private readonly maxUses: number;

  constructor(maxUses = 5) {
    this.maxUses = maxUses;
  }

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const {
      query,
      top_k = 5,
      recency_days,
      site,
      allowed_domains,
      blocked_domains,
      user_location
    } = input;

    // Check max uses
    if (this.searchCount >= this.maxUses) {
      return {
        content: `Error: Maximum web search uses (${this.maxUses}) exceeded. Please refine your queries or increase the limit.`,
        isError: true,
        metadata: {
          error_code: 'max_uses_exceeded',
          max_uses: this.maxUses,
          current_count: this.searchCount
        }
      };
    }

    // Validate domain filters
    if (allowed_domains && blocked_domains) {
      return {
        content: 'Error: Cannot use both allowed_domains and blocked_domains. Choose one filtering strategy.',
        isError: true,
        metadata: {
          error_code: 'invalid_input'
        }
      };
    }

    try {
      // Get provider from config
      const providerName = context.config.tools.websearch.provider || 'mock';

      // Initialize provider
      let provider: SearchProvider;
      let actualProvider: string;
      const apiKey = process.env.TAVILY_API_KEY || '';

      if (providerName === 'tavily' && apiKey) {
        provider = new TavilyProvider(apiKey);
        actualProvider = 'tavily';
      } else {
        provider = new MockProvider();
        actualProvider = 'mock';
      }

      // Execute search
      const results = await provider.search(query, {
        maxResults: top_k,
        recencyDays: recency_days,
        site,
        allowedDomains: allowed_domains,
        blockedDomains: blocked_domains,
        userLocation: user_location
      });

      this.searchCount++;

      // Apply domain filtering
      let filteredResults = results;
      if (allowed_domains && allowed_domains.length > 0) {
        filteredResults = results.filter(r => {
          const urlDomain = new URL(r.url).hostname;
          return allowed_domains.some((d: string) => urlDomain.includes(d));
        });
      }

      if (blocked_domains && blocked_domains.length > 0) {
        filteredResults = filteredResults.filter(r => {
          const urlDomain = new URL(r.url).hostname;
          return !blocked_domains.some((d: string) => urlDomain.includes(d));
        });
      }

      if (filteredResults.length === 0) {
        const filterMsg = allowed_domains
          ? `No results found matching allowed domains: ${allowed_domains.join(', ')}`
          : blocked_domains
          ? `All results were filtered by blocked domains: ${blocked_domains.join(', ')}`
          : `No results found for query: "${query}"`;

        return {
          content: filterMsg,
          isError: false,
          metadata: {
            query,
            provider: actualProvider,
            resultCount: 0,
            totalResults: results.length,
            filteredCount: 0,
            searchCount: this.searchCount,
            maxUses: this.maxUses
          }
        };
      }

      // Format results with citations
      const formattedResults = filteredResults.map((r, idx) => {
        let result = `${idx + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`;
        if (r.published_at) {
          result += `\n   Published: ${r.published_at}`;
        }
        return result;
      }).join('\n\n');

      const locationInfo = user_location
        ? ` (localized to ${[user_location.city, user_location.region, user_location.country].filter(Boolean).join(', ')})`
        : '';

      return {
        content: `Found ${filteredResults.length} result(s) for "${query}"${locationInfo}:\n\n${formattedResults}`,
        isError: false,
        metadata: {
          query,
          provider: actualProvider,
          resultCount: filteredResults.length,
          totalResults: results.length,
          searchCount: this.searchCount,
          maxUses: this.maxUses,
          results: filteredResults.map(r => ({ title: r.title, url: r.url })),
          domainFiltering: {
            allowed: allowed_domains || [],
            blocked: blocked_domains || []
          },
          localization: user_location || null
        }
      };
    } catch (error: any) {
      return {
        content: `Web search error: ${error.message}\n\nTo enable web search:\n1. Sign up at https://tavily.com\n2. Get API key\n3. Set environment variable: export TAVILY_API_KEY=your_key`,
        isError: true
      };
    }
  }
}
