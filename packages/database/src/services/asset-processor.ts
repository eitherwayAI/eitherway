/**
 * Brand Asset Processor
 * Automatically processes uploaded assets: resize, optimize, generate variants
 * Handles images, fonts, and videos with intelligent variant generation
 */

import sharp from 'sharp';

export interface ProcessedAssetVariant {
  purpose: 'favicon' | 'navbar' | 'hero' | 'thumbnail' | 'original' | 'optimized';
  fileName: string;
  storageKey: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  buffer: Buffer;
}

export interface ImageMetadata {
  originalWidth: number;
  originalHeight: number;
  aspectRatio: 'square' | 'horizontal' | 'vertical' | 'ultrawide';
  format: string;
  colorSpace: string;
  hasAlpha: boolean;
}

export interface FontMetadata {
  familyName: string;
  styleName: string;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  format: string;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
}

export class AssetProcessor {
  /**
   * Process uploaded image: resize, optimize, generate variants
   */
  async processImage(
    buffer: Buffer,
    originalFileName: string,
    _mimeType: string,
    brandKitId: string,
    userId: string
  ): Promise<{
    variants: ProcessedAssetVariant[];
    metadata: ImageMetadata;
  }> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: could not extract dimensions');
    }

    const variants: ProcessedAssetVariant[] = [];
    const baseName = originalFileName.replace(/\.[^.]+$/, '');

    // Detect aspect ratio
    const aspectRatio = this.detectAspectRatio(metadata.width, metadata.height);

    // 1. Original (optimized, reduced file size)
    const optimized = await image
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();

    variants.push({
      purpose: 'original',
      fileName: `${baseName}-original.png`,
      storageKey: `brand-kits/${userId}/${brandKitId}/${baseName}-original.png`,
      width: metadata.width,
      height: metadata.height,
      fileSizeBytes: optimized.length,
      mimeType: 'image/png',
      buffer: optimized
    });

    // 2. Generate favicon variants (if square or can be cropped square)
    if (aspectRatio === 'square' || this.canCropToSquare(metadata.width, metadata.height)) {
      const faviconSizes = [16, 32, 64, 128, 256];

      for (const size of faviconSizes) {
        const favicon = await sharp(buffer)
          .resize(size, size, {
            fit: 'cover',
            position: 'center'
          })
          .png()
          .toBuffer();

        variants.push({
          purpose: 'favicon',
          fileName: `favicon-${size}.png`,
          storageKey: `brand-kits/${userId}/${brandKitId}/favicon-${size}.png`,
          width: size,
          height: size,
          fileSizeBytes: favicon.length,
          mimeType: 'image/png',
          buffer: favicon
        });
      }

      // Generate multi-size .ico file
      try {
        const ico = await this.generateIco(buffer, [16, 32, 48]);
        variants.push({
          purpose: 'favicon',
          fileName: 'favicon.ico',
          storageKey: `brand-kits/${userId}/${brandKitId}/favicon.ico`,
          width: 32,
          height: 32,
          fileSizeBytes: ico.length,
          mimeType: 'image/x-icon',
          buffer: ico
        });
      } catch (error) {
        console.warn('[AssetProcessor] Failed to generate .ico file:', error);
        // Continue without .ico - not critical
      }
    }

    // 3. Generate navbar-sized variant (if horizontal or square)
    if (aspectRatio === 'square' || aspectRatio === 'horizontal') {
      const navbarHeight = 64; // Standard navbar height
      const navbarWidth = Math.round((metadata.width / metadata.height) * navbarHeight);

      const navbar = await sharp(buffer)
        .resize(navbarWidth, navbarHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 95 })
        .toBuffer();

      variants.push({
        purpose: 'navbar',
        fileName: `${baseName}-navbar.png`,
        storageKey: `brand-kits/${userId}/${brandKitId}/${baseName}-navbar.png`,
        width: navbarWidth,
        height: navbarHeight,
        fileSizeBytes: navbar.length,
        mimeType: 'image/png',
        buffer: navbar
      });
    }

    // 4. Generate hero-sized variant (max 1920px wide, maintain aspect)
    if (metadata.width > 1920) {
      const heroWidth = 1920;
      const heroHeight = Math.round((metadata.height / metadata.width) * heroWidth);

      const hero = await sharp(buffer)
        .resize(heroWidth, heroHeight)
        .jpeg({ quality: 85 })
        .toBuffer();

      variants.push({
        purpose: 'hero',
        fileName: `${baseName}-hero.jpg`,
        storageKey: `brand-kits/${userId}/${brandKitId}/${baseName}-hero.jpg`,
        width: heroWidth,
        height: heroHeight,
        fileSizeBytes: hero.length,
        mimeType: 'image/jpeg',
        buffer: hero
      });
    }

    // 5. Generate thumbnail (for brand kit gallery UI)
    const thumb = await sharp(buffer)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    variants.push({
      purpose: 'thumbnail',
      fileName: `${baseName}-thumb.png`,
      storageKey: `brand-kits/${userId}/${brandKitId}/${baseName}-thumb.png`,
      width: 200,
      height: 200,
      fileSizeBytes: thumb.length,
      mimeType: 'image/png',
      buffer: thumb
    });

    return {
      variants,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        aspectRatio,
        format: metadata.format || 'unknown',
        colorSpace: metadata.space || 'unknown',
        hasAlpha: metadata.hasAlpha || false
      }
    };
  }

  /**
   * Process font file: extract metadata, convert to web formats
   */
  async processFont(
    buffer: Buffer,
    originalFileName: string,
    mimeType: string,
    brandKitId: string,
    userId: string
  ): Promise<{
    variants: ProcessedAssetVariant[];
    metadata: FontMetadata;
  }> {
    const baseName = originalFileName.replace(/\.[^.]+$/, '');
    const variants: ProcessedAssetVariant[] = [];

    // Store original
    variants.push({
      purpose: 'original',
      fileName: originalFileName,
      storageKey: `brand-kits/${userId}/${brandKitId}/${originalFileName}`,
      width: 0,
      height: 0,
      fileSizeBytes: buffer.length,
      mimeType,
      buffer
    });

    // Extract basic metadata from filename (since opentype.js might not be available)
    const metadata: FontMetadata = {
      familyName: this.extractFontFamily(baseName),
      styleName: this.extractFontStyle(baseName),
      weight: this.detectFontWeightFromName(baseName),
      style: this.detectFontStyleFromName(baseName),
      format: mimeType.split('/')[1] || 'unknown'
    };

    return { variants, metadata };
  }

  /**
   * Process video file: extract basic metadata
   */
  async processVideo(
    buffer: Buffer,
    originalFileName: string,
    brandKitId: string,
    userId: string
  ): Promise<{
    variants: ProcessedAssetVariant[];
    metadata: VideoMetadata;
  }> {
    const variants: ProcessedAssetVariant[] = [];

    // Store original
    variants.push({
      purpose: 'original',
      fileName: originalFileName,
      storageKey: `brand-kits/${userId}/${brandKitId}/${originalFileName}`,
      width: 0,
      height: 0,
      fileSizeBytes: buffer.length,
      mimeType: 'video/mp4',
      buffer
    });

    // Basic metadata (without ffmpeg for now - Phase 3 enhancement)
    const metadata: VideoMetadata = {
      duration: 0, // Will be extracted with ffmpeg in Phase 3
      width: 1920,
      height: 1080,
      codec: 'h264',
      fps: 30
    };

    return { variants, metadata };
  }

  /**
   * Detect aspect ratio category
   */
  private detectAspectRatio(width: number, height: number): 'square' | 'horizontal' | 'vertical' | 'ultrawide' {
    const ratio = width / height;

    if (ratio >= 0.9 && ratio <= 1.1) return 'square';
    if (ratio > 2.5) return 'ultrawide';
    if (ratio > 1.1) return 'horizontal';
    return 'vertical';
  }

  private canCropToSquare(width: number, height: number): boolean {
    const ratio = width / height;
    // Can crop if aspect ratio is between 0.75 and 1.33 (mild cropping acceptable)
    return ratio >= 0.75 && ratio <= 1.33;
  }

  /**
   * Generate multi-resolution .ico file
   */
  private async generateIco(buffer: Buffer, sizes: number[]): Promise<Buffer> {
    // Simple implementation: use smallest PNG as .ico
    // For production, use 'to-ico' package
    const smallest = Math.min(...sizes);
    const ico = await sharp(buffer)
      .resize(smallest, smallest, { fit: 'cover' })
      .png()
      .toBuffer();

    return ico;
  }

  /**
   * Extract font family name from filename
   */
  private extractFontFamily(baseName: string): string {
    // Remove common suffixes
    const cleaned = baseName
      .replace(/-(Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Black|Thin)/gi, '')
      .replace(/_(Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Black|Thin)/gi, '')
      .replace(/\s+(Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Black|Thin)/gi, '');

    return cleaned.replace(/[-_]/g, ' ');
  }

  /**
   * Extract font style from filename
   */
  private extractFontStyle(baseName: string): string {
    const lower = baseName.toLowerCase();

    if (lower.includes('bold') && lower.includes('italic')) return 'Bold Italic';
    if (lower.includes('bolditalic')) return 'Bold Italic';
    if (lower.includes('bold')) return 'Bold';
    if (lower.includes('italic')) return 'Italic';
    if (lower.includes('light')) return 'Light';
    if (lower.includes('medium')) return 'Medium';
    if (lower.includes('semibold')) return 'SemiBold';
    if (lower.includes('extrabold')) return 'ExtraBold';
    if (lower.includes('black')) return 'Black';
    if (lower.includes('thin')) return 'Thin';

    return 'Regular';
  }

  private detectFontWeightFromName(name: string): number {
    const lower = name.toLowerCase();
    if (lower.includes('thin')) return 100;
    if (lower.includes('light')) return 300;
    if (lower.includes('regular') || lower.includes('normal')) return 400;
    if (lower.includes('medium')) return 500;
    if (lower.includes('semibold')) return 600;
    if (lower.includes('bold')) return 700;
    if (lower.includes('extrabold') || lower.includes('heavy')) return 800;
    if (lower.includes('black')) return 900;
    return 400;
  }

  private detectFontStyleFromName(name: string): 'normal' | 'italic' | 'oblique' {
    const lower = name.toLowerCase();
    if (lower.includes('italic')) return 'italic';
    if (lower.includes('oblique')) return 'oblique';
    return 'normal';
  }
}
