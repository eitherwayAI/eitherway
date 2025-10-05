/**
 * eithergen--generate_image: Image generation with provider adapters
 */

import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';

/**
 * Image generation provider interface
 */
interface ImageProvider {
  generate(prompt: string, options: ImageGenOptions): Promise<Uint8Array>;
}

interface ImageGenOptions {
  size: string;
  seed?: number;
}

/**
 * OpenAI DALL-E provider
 */
class OpenAIProvider implements ImageProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string, options: ImageGenOptions): Promise<Uint8Array> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        size: this.mapSize(options.size),
        quality: 'standard',
        n: 1
      })
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data: any = await response.json();
    const imageUrl = data.data[0].url;

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image');
    }

    return new Uint8Array(await imageResponse.arrayBuffer());
  }

  private mapSize(size: string): string {
    // DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
    const [w, h] = size.split('x').map(Number);
    if (w >= 1024 && h >= 1024) {
      if (w > h) return '1792x1024';
      if (h > w) return '1024x1792';
      return '1024x1024';
    }
    return '1024x1024'; // Default
  }
}

/**
 * Custom/mock provider (creates a placeholder)
 */
class CustomProvider implements ImageProvider {
  async generate(prompt: string, options: ImageGenOptions): Promise<Uint8Array> {
    // Generate a simple SVG placeholder
    const [width, height] = options.size.split('x').map(Number);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#e0e0e0"/>
  <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">
    <tspan x="50%" dy="0">Image: ${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}</tspan>
    <tspan x="50%" dy="20">Size: ${options.size}</tspan>
    <tspan x="50%" dy="20">Provider: custom (placeholder)</tspan>
    ${options.seed ? `<tspan x="50%" dy="20">Seed: ${options.seed}</tspan>` : ''}
  </text>
</svg>`;
    return new TextEncoder().encode(svg);
  }
}

export class ImageGenExecutor implements ToolExecutor {
  name = 'eithergen--generate_image';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { prompt, path, size = '512x512', provider = 'custom', seed } = input;

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'. Path is not in allowed workspaces.`,
        isError: true
      };
    }

    try {
      const fullPath = resolve(context.workingDir, path);

      // Initialize provider
      let imageProvider: ImageProvider;
      let actualProvider = provider;

      if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return {
            content: `Error: OpenAI provider requires OPENAI_API_KEY environment variable.\n\nTo enable:\n1. Get API key from https://platform.openai.com/api-keys\n2. Set environment variable: export OPENAI_API_KEY=your_key`,
            isError: true
          };
        }
        imageProvider = new OpenAIProvider(apiKey);
      } else {
        // Use custom/placeholder provider
        imageProvider = new CustomProvider();
        actualProvider = 'custom';
      }

      // Generate image
      const imageData = await imageProvider.generate(prompt, { size, seed });

      // Create parent directories if needed
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Save image
      await writeFile(fullPath, imageData);

      // Determine file extension
      const extension = path.endsWith('.svg') ? 'svg' : 'png';

      return {
        content: `Successfully generated image and saved to '${path}'\n\nPrompt: "${prompt}"\nSize: ${size}\nProvider: ${actualProvider}\n${seed ? `Seed: ${seed}\n` : ''}Format: ${extension}`,
        isError: false,
        metadata: {
          path,
          prompt,
          size,
          provider: actualProvider,
          seed,
          fileSize: imageData.length,
          extension
        }
      };
    } catch (error: any) {
      return {
        content: `Image generation error: ${error.message}`,
        isError: true
      };
    }
  }
}

