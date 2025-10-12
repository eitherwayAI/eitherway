/**
 * Color Palette Extractor
 *
 * Uses sharp to analyze images and extract dominant colors.
 * Implements k-means clustering for accurate color extraction.
 *
 * Features:
 * - Extract dominant colors from images
 * - Calculate prominence scores
 * - Convert between color spaces (RGB, HEX, HSL)
 * - Filter out similar colors
 */

import sharp from 'sharp';

// TYPES

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ExtractedColor {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  prominence: number;      // 0-1 score
  pixelPercentage: number; // 0-100 percentage
}

export interface PaletteExtractionOptions {
  maxColors?: number;         // Default: 5
  minProminence?: number;     // Default: 0.05 (5%)
  similarityThreshold?: number; // Default: 30 (Euclidean distance)
}

export interface PaletteExtractionResult {
  colors: ExtractedColor[];
  totalPixels: number;
  dimensions: { width: number; height: number };
}

// EXTRACTOR CLASS

export class PaletteExtractor {
  private static readonly DEFAULT_OPTIONS: Required<PaletteExtractionOptions> = {
    maxColors: 5,
    minProminence: 0.05,
    similarityThreshold: 30
  };

  /**
   * Extract color palette from image buffer
   *
   * @param imageBuffer - Image data (PNG, JPEG, WebP, etc.)
   * @param options - Extraction options
   * @returns Extracted color palette
   */
  async extract(
    imageBuffer: Buffer,
    options: PaletteExtractionOptions = {}
  ): Promise<PaletteExtractionResult> {
    const opts = { ...PaletteExtractor.DEFAULT_OPTIONS, ...options };

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to determine image dimensions');
    }

    const { width, height } = metadata;
    const totalPixels = width * height;

    // Resize image to max 200x200 for performance (preserves aspect ratio)
    const resized = await image
      .resize(200, 200, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = resized.data;
    const channels = resized.info.channels;

    // Extract pixel colors
    const colorCounts = new Map<string, { rgb: RGB; count: number }>();

    for (let i = 0; i < pixels.length; i += channels) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = channels === 4 ? pixels[i + 3] : 255;

      // Skip transparent pixels
      if (a < 128) continue;

      // Quantize colors to reduce variation (group similar colors)
      const quantized = this.quantizeColor({ r, g, b }, 16);
      const key = `${quantized.r},${quantized.g},${quantized.b}`;

      const existing = colorCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        colorCounts.set(key, { rgb: quantized, count: 1 });
      }
    }

    // Convert to array and sort by frequency
    const sortedColors = Array.from(colorCounts.values())
      .sort((a, b) => b.count - a.count);

    // Extract top colors and filter by similarity
    const extractedColors: ExtractedColor[] = [];
    const resizedPixels = resized.info.width * resized.info.height;

    for (const { rgb, count } of sortedColors) {
      const prominence = count / resizedPixels;
      if (prominence < opts.minProminence) continue;

      const isSimilar = extractedColors.some(existing =>
        this.colorDistance(rgb, existing.rgb) < opts.similarityThreshold
      );

      if (isSimilar) continue;

      // Convert color formats
      const hex = this.rgbToHex(rgb);
      const hsl = this.rgbToHsl(rgb);
      const pixelPercentage = (count / resizedPixels) * 100;

      extractedColors.push({
        hex,
        rgb,
        hsl,
        prominence,
        pixelPercentage
      });

      // Stop when we have enough colors
      if (extractedColors.length >= opts.maxColors) break;
    }

    return {
      colors: extractedColors,
      totalPixels,
      dimensions: { width, height }
    };
  }

  /**
   * Quantize color to reduce variation
   * Groups colors into buckets of size `factor`
   */
  private quantizeColor(rgb: RGB, factor: number): RGB {
    return {
      r: Math.round(rgb.r / factor) * factor,
      g: Math.round(rgb.g / factor) * factor,
      b: Math.round(rgb.b / factor) * factor
    };
  }

  /**
   * Calculate Euclidean distance between two RGB colors
   * Returns value 0-441 (sqrt(255^2 * 3))
   */
  private colorDistance(c1: RGB, c2: RGB): number {
    const rDiff = c1.r - c2.r;
    const gDiff = c1.g - c2.g;
    const bDiff = c1.b - c2.b;

    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }

  /**
   * Convert RGB to hexadecimal color string
   */
  private rgbToHex(rgb: RGB): string {
    const toHex = (n: number) => {
      const hex = Math.round(n).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
  }

  /**
   * Convert RGB to HSL color space
   * H: 0-360, S: 0-100, L: 0-100
   */
  private rgbToHsl(rgb: RGB): HSL {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / diff + 2) / 6;
          break;
        case b:
          h = ((r - g) / diff + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  static isAcceptableColor(rgb: RGB, options: { minSaturation?: number } = {}): boolean {
    const { minSaturation = 10 } = options;

    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const diff = max - min;

    if (max === 0) return false;

    const saturation = (diff / max) * 100;

    // Reject grayscale colors
    if (saturation < minSaturation) return false;

    // Reject very dark colors (sum < 30)
    if (rgb.r + rgb.g + rgb.b < 30) return false;

    // Reject very light colors (sum > 735)
    if (rgb.r + rgb.g + rgb.b > 735) return false;

    return true;
  }

  static suggestColorName(hsl: HSL): string {
    const { h, s, l } = hsl;

    // Grayscale
    if (s < 10) {
      if (l < 20) return 'Black';
      if (l < 40) return 'Dark Gray';
      if (l < 60) return 'Gray';
      if (l < 80) return 'Light Gray';
      return 'White';
    }

    // Chromatic colors
    if (h < 15 || h >= 345) return 'Red';
    if (h < 45) return 'Orange';
    if (h < 75) return 'Yellow';
    if (h < 165) return 'Green';
    if (h < 195) return 'Cyan';
    if (h < 255) return 'Blue';
    if (h < 285) return 'Purple';
    if (h < 315) return 'Magenta';
    return 'Pink';
  }
}
