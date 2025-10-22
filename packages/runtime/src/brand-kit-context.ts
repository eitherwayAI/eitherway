/**
 * Brand Kit Context Builder for AI Agent
 * Builds intelligent, detailed context about brand assets for the agent to use
 */

interface BrandAssetVariant {
  purpose: string;
  fileName: string;
  storageKey: string;
  width: number;
  height: number;
}

interface BrandAsset {
  id: string;
  fileName: string;
  assetType: string;
  mimeType: string;
  metadata?: {
    kind?: string;
    aspectRatio?: string;
    hasAlpha?: boolean;
    familyName?: string;
    weight?: number;
    style?: string;
    variants?: BrandAssetVariant[];
    aiAnalysis?: {
      description?: string;
      dominantColors?: string[];
      hasText?: boolean;
      textContent?: string | null;
      recommendations?: {
        bestFor?: string[];
        notSuitableFor?: string[];
        themeVariant?: 'light' | 'dark' | 'neutral';
        usageNotes?: string;
        cssUsage?: string;
        htmlUsage?: string;
      };
    };
  };
}

interface BrandColor {
  id: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number } | null;
  name: string | null;
  role: string | null;
  prominence: number | null;
  pixelPercentage: number | null;
}

interface BrandKitData {
  id: string;
  name: string;
  assets: BrandAsset[];
  colors: BrandColor[];
}

/**
 * Build comprehensive brand kit context for the agent
 */
export function buildBrandKitContext(brandKit: BrandKitData): string {
  let context = `\n\n═══════════════════════════════════════════════════════════════\n`;
  context += `BRAND KIT AVAILABLE - All files already synced to WebContainer\n`;
  context += `═══════════════════════════════════════════════════════════════\n\n`;

  // Group assets by category
  const icons = brandKit.assets.filter(a => a.metadata?.kind === 'icon');
  const logos = brandKit.assets.filter(a => a.metadata?.kind === 'logo');
  const images = brandKit.assets.filter(a => a.metadata?.kind === 'image');
  const fonts = brandKit.assets.filter(a => a.metadata?.kind === 'font');
  const videos = brandKit.assets.filter(a => a.metadata?.kind === 'video');

  // FAVICONS (Auto-generated from icons or square logos)
  const faviconSources = icons.length > 0 ? icons : logos.filter(l => l.metadata?.aspectRatio === 'square');

  if (faviconSources.length > 0) {
    context += `🔖 FAVICONS (Browser & App Icons)\n`;
    context += `─────────────────────────────────\n`;
    context += `We auto-generated multi-resolution favicons from your brand assets.\n\n`;

    const source = faviconSources[0];
    if (source.metadata?.aiAnalysis?.description) {
      context += `Visual: ${source.metadata.aiAnalysis.description}\n\n`;
    }

    context += `Add to your HTML <head> tag:\n`;
    context += `\`\`\`html\n`;
    context += `<link rel="icon" type="image/x-icon" href="/favicon.ico" />\n`;
    context += `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />\n`;
    context += `<link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />\n`;
    context += `<link rel="apple-touch-icon" sizes="128x128" href="/favicon-128.png" />\n`;
    context += `\`\`\`\n\n`;

    context += `❌ NEVER use horizontal/vertical logos for favicons - they're the wrong shape!\n`;
    context += `✅ These favicons are optimized and ready to use.\n\n`;
  }

  // LOGOS (Navbar, Footer, Hero)
  if (logos.length > 0) {
    context += `🎨 LOGOS (Navigation & Branding)\n`;
    context += `────────────────────────────────\n\n`;

    logos.forEach((logo, idx) => {
      context += `${idx + 1}. "${logo.fileName}"\n`;

      if (logo.metadata?.aiAnalysis?.description) {
        context += `   Visual: ${logo.metadata.aiAnalysis.description}\n`;
      }

      if (logo.metadata?.aspectRatio) {
        context += `   Shape: ${logo.metadata.aspectRatio}\n`;
      }

      if (logo.metadata?.aiAnalysis?.recommendations?.themeVariant) {
        const theme = logo.metadata.aiAnalysis.recommendations.themeVariant;
        context += `   Background: Works on ${theme} backgrounds`;
        if (theme === 'light') {
          context += ` (use on white/light navbars)`;
        } else if (theme === 'dark') {
          context += ` (use on dark navbars)`;
        }
        context += `\n`;
      }

      // Show recommended usage
      const navbarVariant = logo.metadata?.variants?.find(v => v.purpose === 'navbar');
      const originalVariant = logo.metadata?.variants?.find(v => v.purpose === 'original');

      if (navbarVariant) {
        context += `\n   ✅ NAVBAR (optimized ${navbarVariant.width}×${navbarVariant.height}px):\n`;
        context += `   \`\`\`jsx\n`;
        context += `   <img src="/assets/${navbarVariant.fileName}" alt="Logo" className="h-8 md:h-12" />\n`;
        context += `   \`\`\`\n`;
      }

      if (originalVariant && logo.metadata?.aspectRatio === 'horizontal') {
        context += `\n   ✅ FOOTER (full resolution):\n`;
        context += `   \`\`\`jsx\n`;
        context += `   <img src="/assets/${originalVariant.fileName}" alt="Logo" className="h-16" />\n`;
        context += `   \`\`\`\n`;
      }

      if (logo.metadata?.aiAnalysis?.recommendations?.bestFor) {
        context += `\n   Best for: ${logo.metadata.aiAnalysis.recommendations.bestFor.join(', ')}\n`;
      }

      if (logo.metadata?.aiAnalysis?.recommendations?.notSuitableFor &&
          logo.metadata.aiAnalysis.recommendations.notSuitableFor.length > 0) {
        context += `   ❌ Avoid: ${logo.metadata.aiAnalysis.recommendations.notSuitableFor.join(', ')}\n`;
      }

      if (logo.metadata?.aiAnalysis?.recommendations?.usageNotes) {
        context += `\n   💡 ${logo.metadata.aiAnalysis.recommendations.usageNotes}\n`;
      }

      context += `\n`;
    });
  }

  // IMAGES (Content, Backgrounds, Hero)
  if (images.length > 0) {
    context += `🖼️  IMAGES (Content & Backgrounds)\n`;
    context += `─────────────────────────────────\n\n`;

    images.forEach((image, idx) => {
      context += `${idx + 1}. "${image.fileName}"\n`;

      if (image.metadata?.aiAnalysis?.description) {
        context += `   Visual: ${image.metadata.aiAnalysis.description}\n`;
      }

      const originalVariant = image.metadata?.variants?.find(v => v.purpose === 'original');
      const heroVariant = image.metadata?.variants?.find(v => v.purpose === 'hero');

      if (heroVariant) {
        context += `   Available: Hero-optimized version (${heroVariant.width}×${heroVariant.height}px)\n`;
        context += `   Path: /assets/${heroVariant.fileName}\n`;
      } else if (originalVariant) {
        context += `   Path: /assets/${originalVariant.fileName}\n`;
      }

      if (image.metadata?.aiAnalysis?.recommendations?.bestFor) {
        context += `   Best for: ${image.metadata.aiAnalysis.recommendations.bestFor.join(', ')}\n`;
      }

      context += `\n`;
    });
  }

  // FONTS (Typography System)
  if (fonts.length > 0) {
    context += `✏️  FONTS (Typography)\n`;
    context += `────────────────────\n\n`;

    // Group fonts by family
    const fontFamilies = fonts.reduce((acc, font) => {
      const family = font.metadata?.familyName || 'Unknown';
      if (!acc[family]) acc[family] = [];
      acc[family].push(font);
      return acc;
    }, {} as Record<string, BrandAsset[]>);

    Object.entries(fontFamilies).forEach(([family, variants]) => {
      context += `Font Family: "${family}"\n`;
      context += `Variants:\n`;

      variants.forEach(font => {
        const weight = font.metadata?.weight || 400;
        const style = font.metadata?.style || 'normal';
        context += `  - ${font.fileName.split('.')[0]} (weight: ${weight}, style: ${style})\n`;
      });

      // Provide CSS @font-face declarations
      context += `\n@font-face declarations:\n`;
      context += `\`\`\`css\n`;
      variants.forEach(font => {
        const weight = font.metadata?.weight || 400;
        const style = font.metadata?.style || 'normal';
        context += `@font-face {\n`;
        context += `  font-family: '${family}';\n`;
        context += `  src: url('/fonts/${font.fileName}') format('woff2');\n`;
        context += `  font-weight: ${weight};\n`;
        context += `  font-style: ${style};\n`;
        context += `  font-display: swap;\n`;
        context += `}\n\n`;
      });
      context += `\`\`\`\n\n`;

      // Provide usage recommendations
      const hasHeadingWeight = variants.some(v => (v.metadata?.weight || 400) >= 600);
      const hasBodyWeight = variants.some(v => (v.metadata?.weight || 400) <= 500);

      if (hasHeadingWeight && hasBodyWeight) {
        context += `Recommended usage:\n`;
        context += `\`\`\`css\n`;
        const headingFont = variants.find(v => (v.metadata?.weight || 400) >= 600);
        const bodyFont = variants.find(v => (v.metadata?.weight || 400) <= 500);
        context += `h1, h2, h3 { \n`;
        context += `  font-family: '${family}', sans-serif;\n`;
        context += `  font-weight: ${headingFont?.metadata?.weight || 700};\n`;
        context += `}\n\n`;
        context += `body, p { \n`;
        context += `  font-family: '${family}', sans-serif;\n`;
        context += `  font-weight: ${bodyFont?.metadata?.weight || 400};\n`;
        context += `}\n`;
        context += `\`\`\`\n`;
      } else if (hasHeadingWeight) {
        context += `✅ Best for: Headings and emphasis (bold weight)\n`;
      } else {
        context += `✅ Best for: Body text and UI elements\n`;
      }

      context += `\n`;
    });
  }

  // VIDEOS (Background, Content)
  if (videos.length > 0) {
    context += `🎥 VIDEOS\n`;
    context += `────────\n\n`;

    videos.forEach((video, idx) => {
      context += `${idx + 1}. "${video.fileName}"\n`;
      context += `   Path: /videos/${video.fileName}\n`;

      if (video.metadata?.aiAnalysis?.recommendations?.htmlUsage) {
        context += `\n   Example usage:\n`;
        context += `   \`\`\`jsx\n`;
        context += `   ${video.metadata.aiAnalysis.recommendations.htmlUsage.split('\n').join('\n   ')}\n`;
        context += `   \`\`\`\n`;
      }

      if (video.metadata?.aiAnalysis?.recommendations?.usageNotes) {
        context += `   💡 ${video.metadata.aiAnalysis.recommendations.usageNotes}\n`;
      }

      context += `\n`;
    });
  }

  // BRAND COLORS
  if (brandKit.colors.length > 0) {
    context += `🎨 BRAND COLOR PALETTE\n`;
    context += `──────────────────────\n`;
    context += `Automatically extracted from your brand assets:\n\n`;

    brandKit.colors
      .sort((a, b) => (b.prominence || 0) - (a.prominence || 0))
      .slice(0, 5)
      .forEach((color, idx) => {
        const role = idx === 0 ? 'PRIMARY' : idx === 1 ? 'SECONDARY' : `ACCENT ${idx}`;
        context += `${color.hex} - ${color.name || 'Color'} (${role})\n`;

        if (idx === 0) {
          context += `  → Use for: Primary buttons, CTAs, links, brand highlights\n`;
        } else if (idx === 1) {
          context += `  → Use for: Secondary buttons, hover states, accents\n`;
        } else {
          context += `  → Use for: Subtle highlights, borders, backgrounds\n`;
        }
      });

    context += `\n`;
  }

  // CRITICAL USAGE RULES - Only show rules for assets that exist
  const hasAnyAssets = brandKit.assets.length > 0 || brandKit.colors.length > 0;

  if (hasAnyAssets) {
    context += `\n═══════════════════════════════════════════════════════════════\n`;
    context += `CRITICAL USAGE RULES - READ CAREFULLY\n`;
    context += `═══════════════════════════════════════════════════════════════\n\n`;

    let ruleNumber = 1;

    // Rule 1: Paths (always show if any assets exist)
    if (brandKit.assets.length > 0) {
      context += `${ruleNumber++}. PATHS ARE EXACT - Use the paths shown above exactly as written\n`;
      context += `   ✅ <link rel="icon" href="/favicon.ico" />\n`;
      context += `   ✅ <img src="/assets/logo-navbar.png" />\n`;
      context += `   ❌ <img src="/public/assets/logo.png" /> (WRONG - no /public)\n`;
      context += `   ❌ <img src="./assets/logo.png" /> (WRONG - use absolute paths)\n\n`;
    }

    // Rule: Favicon (only if favicons exist)
    if (faviconSources.length > 0) {
      context += `${ruleNumber++}. FAVICON RULES\n`;
      context += `   ✅ Use auto-generated /favicon.ico and /favicon-*.png files\n`;
      context += `   ❌ NEVER use horizontal/vertical logos as favicons\n`;
      context += `   ❌ NEVER use navbar logos for <link rel="icon">\n\n`;
    }

    // Rule: Logos (only if logos exist)
    if (logos.length > 0) {
      context += `${ruleNumber++}. LOGO RULES\n`;
      context += `   ✅ Check "Background" field (light/dark/neutral)\n`;
      context += `   ✅ Use -navbar.png variants for navigation (optimized size)\n`;
      context += `   ✅ Match logo background to navbar background\n`;
      context += `   ❌ Don't use horizontal logos for square contexts\n`;
      context += `   ❌ Don't use vertical logos for wide contexts\n\n`;
    }

    // Rule: Fonts (only if fonts exist)
    if (fonts.length > 0) {
      context += `${ruleNumber++}. FONT RULES\n`;
      context += `   ✅ Import ALL @font-face declarations before using\n`;
      context += `   ✅ Use weight ≥600 for headings (h1, h2, h3)\n`;
      context += `   ✅ Use weight ≤500 for body text (p, div, span)\n`;
      context += `   ✅ Always provide fallback: font-family: 'BrandFont', sans-serif\n`;
      context += `   ❌ Never use font-family without @font-face import\n\n`;
    }

    // Rule: Videos (only if videos exist)
    if (videos.length > 0) {
      context += `${ruleNumber++}. VIDEO RULES\n`;
      context += `   ✅ Short videos (<10s): autoplay loop muted playsinline\n`;
      context += `   ✅ Long videos (>10s): controls, no autoplay\n`;
      context += `   ❌ Never autoplay videos with sound\n\n`;
    }

    // Rule: Colors (only if colors exist)
    if (brandKit.colors.length > 0) {
      context += `${ruleNumber++}. COLOR RULES\n`;
      context += `   ✅ Use PRIMARY color for main CTAs and brand elements\n`;
      context += `   ✅ Use SECONDARY color for secondary actions and highlights\n`;
      context += `   ❌ Don't override brand colors with random colors\n`;
      context += `   ❌ Don't use accent colors for primary CTAs\n\n`;
    }

    context += `IMPORTANT NOTES:\n`;
    context += `• All files are already synced to WebContainer (public/ directory)\n`;
    if (brandKit.assets.some(a => a.metadata?.variants && a.metadata.variants.length > 1)) {
      context += `• Variants are pre-optimized for different use cases\n`;
    }
    if (brandKit.assets.some(a => a.metadata?.aiAnalysis)) {
      context += `• AI analysis provides intelligent recommendations - follow them\n`;
      context += `• Read visual descriptions to understand what assets look like\n`;
    }
    context += `\n`;
  }

  return context;
}
