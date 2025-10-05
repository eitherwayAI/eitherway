/**
 * websearch--web_search: Web search with provider adapters
 */

import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published_at?: string;
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

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { query, top_k = 5, recency_days, site } = input;

    try {
      // Get provider from config
      const providerName = context.config.tools.websearch.provider || 'mock';

      // Initialize provider
      let provider: SearchProvider;
      const apiKey = process.env.TAVILY_API_KEY || '';

      if (providerName === 'tavily' && apiKey) {
        provider = new TavilyProvider(apiKey);
      } else {
        // Fallback to mock if no API key or unsupported provider
        provider = new MockProvider();
      }

      // Execute search
      const results = await provider.search(query, {
        maxResults: top_k,
        recencyDays: recency_days,
        site
      });

      if (results.length === 0) {
        return {
          content: `No results found for query: "${query}"`,
          isError: false,
          metadata: {
            query,
            provider: providerName,
            resultCount: 0
          }
        };
      }

      // Format results
      const formattedResults = results.map((r, idx) => {
        let result = `${idx + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`;
        if (r.published_at) {
          result += `\n   Published: ${r.published_at}`;
        }
        return result;
      }).join('\n\n');

      return {
        content: `Found ${results.length} result(s) for "${query}":\n\n${formattedResults}`,
        isError: false,
        metadata: {
          query,
          provider: providerName,
          resultCount: results.length,
          results: results.map(r => ({ title: r.title, url: r.url }))
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
