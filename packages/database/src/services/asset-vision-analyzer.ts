/**
 * Brand Asset Vision Analyzer
 * Uses Claude Vision API to analyze images and provide intelligent usage recommendations
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ImageMetadata, FontMetadata, VideoMetadata } from './asset-processor.js';

export interface AssetAIAnalysis {
  description: string;
  dominantColors?: string[];
  hasText?: boolean;
  textContent?: string | null;
  recommendations: {
    bestFor: string[];
    notSuitableFor: string[];
    themeVariant?: 'light' | 'dark' | 'neutral';
    usageNotes?: string;
    cssUsage?: string;
    htmlUsage?: string;
  };
}

export class AssetVisionAnalyzer {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for vision analysis');
    }
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Analyze asset with appropriate method based on type
   */
  async analyzeAsset(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    processedMetadata: ImageMetadata | FontMetadata | VideoMetadata,
    assetType: 'image' | 'logo' | 'icon' | 'font' | 'video'
  ): Promise<AssetAIAnalysis> {
    // Fonts: Use filename-based analysis
    if (assetType === 'font') {
      return this.analyzeFontAsset(fileName, processedMetadata as FontMetadata);
    }

    // Videos: Use metadata-based analysis
    if (assetType === 'video') {
      return this.analyzeVideoAsset(fileName, processedMetadata as VideoMetadata);
    }

    // Images/Logos/Icons: Use Claude Vision
    return this.analyzeImageWithVision(buffer, fileName, mimeType, processedMetadata as ImageMetadata, assetType);
  }

  /**
   * Analyze image using Claude Vision API
   */
  private async analyzeImageWithVision(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    metadata: ImageMetadata,
    assetType: 'image' | 'logo' | 'icon'
  ): Promise<AssetAIAnalysis> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: buffer.toString('base64')
                }
              },
              {
                type: 'text',
                text: `Analyze this ${assetType} image for web development use:

File: ${fileName}
Original size: ${metadata.originalWidth}×${metadata.originalHeight}px
Aspect ratio: ${metadata.aspectRatio}
Has transparency: ${metadata.hasAlpha}

Provide JSON analysis with these exact keys:
{
  "visualDescription": "Detailed description (colors, layout, any text visible, style)",
  "dominantColors": ["#HEX1", "#HEX2"] (2-3 main colors as hex codes),
  "hasText": true/false,
  "textContent": "any visible text" or null,
  "bestFor": ["navbar", "favicon", "hero", "footer", "background", "content"] (choose 1-3 most suitable),
  "notSuitableFor": [] (contexts to avoid, if any),
  "themeVariant": "light" | "dark" | "neutral" (based on background color),
  "usageNotes": "specific guidance for developers using this asset"
}

Guidelines:
- For horizontal logos → bestFor: ["navbar", "footer"]
- For square icons/logos → bestFor: ["favicon", "app-icon"]
- For light backgrounds → themeVariant: "light"
- For dark backgrounds → themeVariant: "dark"
- For transparent/colorful → themeVariant: "neutral"

Return only valid JSON, no markdown.`
              }
            ]
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response (handle markdown code blocks if present)
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      const analysis = JSON.parse(jsonText);

      return {
        description: analysis.visualDescription || 'Brand asset',
        dominantColors: analysis.dominantColors || [],
        hasText: analysis.hasText || false,
        textContent: analysis.textContent || null,
        recommendations: {
          bestFor: analysis.bestFor || ['content'],
          notSuitableFor: analysis.notSuitableFor || [],
          themeVariant: analysis.themeVariant || 'neutral',
          usageNotes: analysis.usageNotes || ''
        }
      };
    } catch (error: any) {
      console.error('[AssetVisionAnalyzer] Vision analysis failed:', error);

      // Fallback: Basic analysis without vision
      return this.getFallbackImageAnalysis(metadata, assetType);
    }
  }

  /**
   * Analyze font asset (metadata-based)
   */
  private analyzeFontAsset(fileName: string, metadata: FontMetadata): AssetAIAnalysis {
    const isBold = metadata.weight >= 600;

    const bestFor = isBold
      ? ['headings', 'titles', 'emphasis']
      : ['body', 'paragraphs', 'ui-text'];

    const notSuitableFor = isBold
      ? ['body-text', 'long-paragraphs']
      : [];

    const cssUsage = `@font-face {
  font-family: '${metadata.familyName}';
  src: url('/fonts/${fileName}') format('${this.getFontFormat(metadata.format)}');
  font-weight: ${metadata.weight};
  font-style: ${metadata.style};
  font-display: swap;
}

/* Apply to ${isBold ? 'headings' : 'body text'}: */
${isBold ? 'h1, h2, h3' : 'body, p, div'} {
  font-family: '${metadata.familyName}', ${isBold ? 'sans-serif' : 'system-ui, sans-serif'};
}`;

    return {
      description: `${metadata.familyName} ${metadata.styleName} font (weight: ${metadata.weight}, style: ${metadata.style})`,
      recommendations: {
        bestFor,
        notSuitableFor,
        cssUsage
      }
    };
  }

  /**
   * Analyze video asset (metadata-based)
   */
  private analyzeVideoAsset(fileName: string, metadata: VideoMetadata): AssetAIAnalysis {
    const isShort = metadata.duration < 10;
    const isLong = metadata.duration > 30;

    const bestFor = isShort
      ? ['background-video', 'hero-section', 'animation']
      : isLong
      ? ['content-section', 'tutorial', 'showcase']
      : ['hero-section', 'content-section'];

    const notSuitableFor = isLong
      ? ['background-video', 'auto-play']
      : [];

    const htmlUsage = isShort
      ? `<video autoplay loop muted playsinline className="w-full h-full object-cover">
  <source src="/videos/${fileName}" type="video/mp4" />
  Your browser does not support video.
</video>`
      : `<video controls className="w-full rounded-lg">
  <source src="/videos/${fileName}" type="video/mp4" />
  Your browser does not support video.
</video>`;

    return {
      description: `Video: ${metadata.width}×${metadata.height}px, ${Math.round(metadata.duration)}s duration, ${Math.round(metadata.fps)}fps`,
      recommendations: {
        bestFor,
        notSuitableFor,
        usageNotes: isShort
          ? 'Short video suitable for looping background or hero animations. Use with autoplay and muted attributes.'
          : isLong
          ? 'Longer video content. Display with controls and avoid auto-play to respect user preferences.'
          : 'Medium-length video. Can be used for hero sections or featured content.',
        htmlUsage
      }
    };
  }

  /**
   * Fallback analysis when vision API fails
   */
  private getFallbackImageAnalysis(metadata: ImageMetadata, assetType: string): AssetAIAnalysis {
    const { aspectRatio } = metadata;

    let bestFor: string[] = [];
    let notSuitableFor: string[] = [];

    if (aspectRatio === 'square') {
      bestFor = ['favicon', 'app-icon', 'avatar'];
      notSuitableFor = ['navbar', 'footer'];
    } else if (aspectRatio === 'horizontal' || aspectRatio === 'ultrawide') {
      bestFor = ['navbar', 'footer', 'banner'];
      notSuitableFor = ['favicon'];
    } else if (aspectRatio === 'vertical') {
      bestFor = ['sidebar', 'mobile-header'];
      notSuitableFor = ['navbar', 'favicon'];
    }

    return {
      description: `${assetType} image (${aspectRatio} aspect ratio, ${metadata.originalWidth}×${metadata.originalHeight}px)`,
      recommendations: {
        bestFor,
        notSuitableFor,
        themeVariant: 'neutral',
        usageNotes: 'Vision analysis unavailable. Recommendations based on aspect ratio only.'
      }
    };
  }

  private getFontFormat(format: string): string {
    const formatMap: Record<string, string> = {
      'woff2': 'woff2',
      'woff': 'woff',
      'ttf': 'truetype',
      'otf': 'opentype'
    };
    return formatMap[format] || 'truetype';
  }
}
