/**
 * Configuration loader
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { ClaudeConfig, AgentConfig } from '@eitherway/tools-core';

export class ConfigLoader {
  private configDir: string;

  constructor(configDir: string = './configs') {
    this.configDir = configDir;
  }

  /**
   * Load Claude/Anthropic configuration
   */
  async loadClaudeConfig(): Promise<ClaudeConfig> {
    const configPath = resolve(this.configDir, 'anthropic.json');

    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as ClaudeConfig;

      // Validate required fields
      if (!config.apiKey) {
        throw new Error('API key is required in anthropic.json');
      }

      if (!config.model) {
        config.model = 'claude-sonnet-4-5-20250929';
      }

      // Set defaults
      const claudeConfig: ClaudeConfig = {
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens || 8192,
        temperature: config.temperature ?? 0.2,
        streaming: config.streaming ?? true,
        provider: config.provider || 'anthropic',
        providerConfig: config.providerConfig,
        thinking: config.thinking,
        promptCaching: config.promptCaching,
      };

      // Only include topP if explicitly set (Claude 4.5 doesn't allow both temperature and topP)
      if (config.topP !== undefined) {
        claudeConfig.topP = config.topP;
      }

      return claudeConfig;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `Config file not found: ${configPath}\n` +
            `Please copy configs/anthropic.example.json to configs/anthropic.json and add your API key.`,
        );
      }
      throw error;
    }
  }

  /**
   * Load agent configuration
   */
  async loadAgentConfig(): Promise<AgentConfig> {
    const configPath = resolve(this.configDir, 'agent.json');

    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as AgentConfig;

      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config file not found: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Load both configurations
   */
  async loadAll(): Promise<{ claudeConfig: ClaudeConfig; agentConfig: AgentConfig }> {
    const [claudeConfig, agentConfig] = await Promise.all([this.loadClaudeConfig(), this.loadAgentConfig()]);

    return { claudeConfig, agentConfig };
  }
}
