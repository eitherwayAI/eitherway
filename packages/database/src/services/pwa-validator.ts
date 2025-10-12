/**
 * PWA Validator
 *
 * Validates Progressive Web App (PWA) requirements:
 * - Manifest.json validation
 * - Service Worker detection
 * - Icon requirements
 * - HTTPS enforcement
 * - Viewport meta tag
 * - Offline readiness
 *
 * Scoring: 0-100 composite score based on PWA best practices
 */

// TYPES

export interface PWAValidationResult {
  status: 'passed' | 'failed' | 'warning';
  overall_score: number;
  manifest_score: number;
  service_worker_score: number;
  icons_score: number;

  // Manifest validation
  manifest_valid: boolean;
  manifest_url?: string;
  manifest_errors: string[];
  manifest_warnings: string[];
  manifest_data?: ManifestData;

  // Service Worker validation
  service_worker_registered: boolean;
  service_worker_url?: string;
  service_worker_scope?: string;
  service_worker_errors: string[];

  // Icons validation
  icons_valid: boolean;
  icons_found: IconInfo[];
  icons_missing: string[];

  // Required fields
  has_name: boolean;
  has_short_name: boolean;
  has_start_url: boolean;
  has_display: boolean;
  has_theme_color: boolean;
  has_background_color: boolean;
  has_icons: boolean;

  // Additional checks
  is_https: boolean;
  has_viewport_meta: boolean;
  offline_ready: boolean;

  validation_url: string;
  validation_errors: string[];
}

export interface ManifestData {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  description?: string;
  icons?: IconInfo[];
  scope?: string;
  orientation?: string;
  [key: string]: any;
}

export interface IconInfo {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

// PWA VALIDATOR CLASS

export class PWAValidator {
  /**
   * Required icon sizes for PWA
   */
  private static readonly REQUIRED_ICON_SIZES = [
    '192x192',   // Minimum for "Add to Home Screen"
    '512x512'    // Recommended for splash screen
  ];


  /**
   * Valid display modes
   */
  private static readonly VALID_DISPLAY_MODES = [
    'fullscreen',
    'standalone',
    'minimal-ui',
    'browser'
  ];

  async validate(baseUrl: string): Promise<PWAValidationResult> {
    const result: PWAValidationResult = {
      status: 'failed',
      overall_score: 0,
      manifest_score: 0,
      service_worker_score: 0,
      icons_score: 0,

      manifest_valid: false,
      manifest_errors: [],
      manifest_warnings: [],

      service_worker_registered: false,
      service_worker_errors: [],

      icons_valid: false,
      icons_found: [],
      icons_missing: [],

      has_name: false,
      has_short_name: false,
      has_start_url: false,
      has_display: false,
      has_theme_color: false,
      has_background_color: false,
      has_icons: false,

      is_https: false,
      has_viewport_meta: false,
      offline_ready: false,

      validation_url: baseUrl,
      validation_errors: []
    };

    try {
      // Normalize URL
      const url = new URL(baseUrl);

      result.is_https = url.protocol === 'https:' || url.hostname === 'localhost';
      if (!result.is_https) {
        result.validation_errors.push('PWA requires HTTPS (or localhost for development)');
      }

      await this.validateManifest(url, result);

      await this.validateServiceWorker(url, result);

      this.validateIcons(result);

      await this.validateViewportMeta(url, result);

      this.calculateScores(result);

      // Determine overall status
      if (result.overall_score >= 90) {
        result.status = 'passed';
      } else if (result.overall_score >= 60) {
        result.status = 'warning';
      } else {
        result.status = 'failed';
      }

    } catch (error: any) {
      result.validation_errors.push(`Validation error: ${error.message}`);
      result.status = 'failed';
    }

    return result;
  }

  private async validateManifest(baseUrl: URL, result: PWAValidationResult): Promise<void> {
    try {
      // Try common manifest locations
      const manifestPaths = [
        '/manifest.json',
        '/manifest.webmanifest',
        '/site.webmanifest'
      ];

      let manifestData: ManifestData | null = null;
      let manifestUrl: string | null = null;

      for (const path of manifestPaths) {
        try {
          const url = new URL(path, baseUrl).toString();
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            manifestData = await response.json() as ManifestData;
            manifestUrl = url;
            break;
          }
        } catch (e) {
          // Try next path
          continue;
        }
      }

      if (!manifestData) {
        result.manifest_errors.push('Manifest file not found (tried /manifest.json, /manifest.webmanifest, /site.webmanifest)');
        return;
      }

      result.manifest_url = manifestUrl!;
      result.manifest_data = manifestData;

      if (manifestData.name) {
        result.has_name = true;
        if (manifestData.name.length > 45) {
          result.manifest_warnings.push('Name is longer than 45 characters (may be truncated on home screen)');
        }
      } else {
        result.manifest_errors.push('Missing required field: name');
      }

      if (manifestData.short_name) {
        result.has_short_name = true;
        if (manifestData.short_name.length > 12) {
          result.manifest_warnings.push('Short name is longer than 12 characters (may be truncated)');
        }
      } else {
        result.manifest_warnings.push('Missing recommended field: short_name');
      }

      if (manifestData.start_url) {
        result.has_start_url = true;
      } else {
        result.manifest_warnings.push('Missing recommended field: start_url (defaults to /)');
      }

      if (manifestData.display) {
        result.has_display = true;
        if (!PWAValidator.VALID_DISPLAY_MODES.includes(manifestData.display)) {
          result.manifest_errors.push(`Invalid display mode: ${manifestData.display}`);
        }
        if (manifestData.display === 'browser') {
          result.manifest_warnings.push('Display mode "browser" is not recommended for PWAs (use "standalone" or "fullscreen")');
        }
      } else {
        result.manifest_warnings.push('Missing recommended field: display (defaults to "browser")');
      }

      if (manifestData.theme_color) {
        result.has_theme_color = true;
        if (!this.isValidColor(manifestData.theme_color)) {
          result.manifest_errors.push(`Invalid theme_color format: ${manifestData.theme_color}`);
        }
      } else {
        result.manifest_warnings.push('Missing recommended field: theme_color');
      }

      if (manifestData.background_color) {
        result.has_background_color = true;
        if (!this.isValidColor(manifestData.background_color)) {
          result.manifest_errors.push(`Invalid background_color format: ${manifestData.background_color}`);
        }
      } else {
        result.manifest_warnings.push('Missing recommended field: background_color');
      }

      if (manifestData.icons && Array.isArray(manifestData.icons) && manifestData.icons.length > 0) {
        result.has_icons = true;
        result.icons_found = manifestData.icons.map(icon => ({
          src: icon.src,
          sizes: icon.sizes || '',
          type: icon.type,
          purpose: icon.purpose
        }));
      } else {
        result.manifest_errors.push('Missing required field: icons (at least one icon required)');
      }

      if (!manifestData.description) {
        result.manifest_warnings.push('Missing optional field: description (helps users understand your app)');
      }

      // Manifest is valid if no critical errors
      result.manifest_valid = result.manifest_errors.length === 0 && result.has_name && result.has_icons;

    } catch (error: any) {
      result.manifest_errors.push(`Failed to fetch or parse manifest: ${error.message}`);
    }
  }

  private async validateServiceWorker(baseUrl: URL, result: PWAValidationResult): Promise<void> {
    // In a real implementation, this would:
    // 1. Load the page in a headless browser
    // 2. Check navigator.serviceWorker.controller
    // 3. Verify service worker registration

    // For now, we'll check for common service worker file existence
    const swPaths = [
      '/sw.js',
      '/service-worker.js',
      '/serviceworker.js'
    ];

    for (const path of swPaths) {
      try {
        const url = new URL(path, baseUrl).toString();
        const response = await fetch(url, {
          method: 'HEAD',
          headers: { 'Accept': 'application/javascript' }
        });

        if (response.ok) {
          result.service_worker_registered = true;
          result.service_worker_url = url;
          result.service_worker_scope = '/';
          break;
        }
      } catch (e) {
        // Try next path
        continue;
      }
    }

    if (!result.service_worker_registered) {
      result.service_worker_errors.push('Service worker not found (checked /sw.js, /service-worker.js, /serviceworker.js)');
      result.service_worker_errors.push('Note: Service worker is required for offline functionality and "Add to Home Screen" prompt');
    }

    // For now, assume offline-ready if service worker is registered
    result.offline_ready = result.service_worker_registered;
  }

  private validateIcons(result: PWAValidationResult): void {
    if (result.icons_found.length === 0) {
      result.icons_missing = PWAValidator.REQUIRED_ICON_SIZES;
      return;
    }

    const availableSizes = new Set<string>();
    result.icons_found.forEach(icon => {
      if (icon.sizes) {
        icon.sizes.split(' ').forEach(size => availableSizes.add(size.toLowerCase()));
      }
    });

    const missing: string[] = [];
    PWAValidator.REQUIRED_ICON_SIZES.forEach(size => {
      if (!availableSizes.has(size.toLowerCase())) {
        missing.push(size);
      }
    });

    result.icons_missing = missing;
    result.icons_valid = missing.length === 0;

    const hasMaskable = result.icons_found.some(icon =>
      icon.purpose?.includes('maskable')
    );

    if (!hasMaskable) {
      result.manifest_warnings.push('No maskable icons found (recommended for better appearance on Android)');
    }
  }

  private async validateViewportMeta(baseUrl: URL, result: PWAValidationResult): Promise<void> {
    try {
      const response = await fetch(baseUrl.toString());
      const html = await response.text();

      const hasViewport = /<meta\s+name=["']viewport["']/i.test(html);

      result.has_viewport_meta = hasViewport;

      if (!hasViewport) {
        result.validation_errors.push('Missing <meta name="viewport"> tag (required for mobile responsiveness)');
      }
    } catch (error: any) {
      result.validation_errors.push(`Failed to check viewport meta: ${error.message}`);
    }
  }

  /**
   * Calculate validation scores
   */
  private calculateScores(result: PWAValidationResult): void {
    // Manifest score (40% of total)
    let manifestScore = 0;
    if (result.has_name) manifestScore += 10;
    if (result.has_short_name) manifestScore += 5;
    if (result.has_start_url) manifestScore += 5;
    if (result.has_display && result.manifest_data?.display !== 'browser') manifestScore += 5;
    if (result.has_theme_color) manifestScore += 5;
    if (result.has_background_color) manifestScore += 5;
    if (result.has_icons) manifestScore += 5;
    result.manifest_score = manifestScore;

    // Service Worker score (30% of total)
    let swScore = 0;
    if (result.service_worker_registered) swScore += 20;
    if (result.offline_ready) swScore += 10;
    result.service_worker_score = swScore;

    // Icons score (20% of total)
    let iconsScore = 0;
    if (result.icons_found.length > 0) iconsScore += 5;
    if (result.icons_valid) iconsScore += 10;
    if (result.icons_found.some(i => i.purpose?.includes('maskable'))) iconsScore += 5;
    result.icons_score = iconsScore;

    // Additional checks (10% of total)
    let additionalScore = 0;
    if (result.is_https) additionalScore += 5;
    if (result.has_viewport_meta) additionalScore += 5;

    // Overall score
    result.overall_score = manifestScore + swScore + iconsScore + additionalScore;
  }

  private isValidColor(color: string): boolean {
    // Hex color
    if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) return true;

    // RGB/RGBA
    if (/^rgba?\(/.test(color)) return true;

    // HSL/HSLA
    if (/^hsla?\(/.test(color)) return true;

    // Named colors
    const namedColors = ['white', 'black', 'red', 'blue', 'green', 'yellow', 'transparent'];
    if (namedColors.includes(color.toLowerCase())) return true;

    return false;
  }

  /**
   * Generate validation report summary
   */
  static generateReport(result: PWAValidationResult): string {
    const lines: string[] = [];

    lines.push(`# PWA Validation Report`);
    lines.push(`Status: ${result.status.toUpperCase()}`);
    lines.push(`Overall Score: ${result.overall_score}/100`);
    lines.push(``);

    lines.push(`## Scores`);
    lines.push(`- Manifest: ${result.manifest_score}/40`);
    lines.push(`- Service Worker: ${result.service_worker_score}/30`);
    lines.push(`- Icons: ${result.icons_score}/20`);
    lines.push(`- Additional: ${10 - (result.manifest_score + result.service_worker_score + result.icons_score - result.overall_score)}/10`);
    lines.push(``);

    if (result.manifest_errors.length > 0) {
      lines.push(`## Manifest Errors (${result.manifest_errors.length})`);
      result.manifest_errors.forEach(err => lines.push(`- ${err}`));
      lines.push(``);
    }

    if (result.manifest_warnings.length > 0) {
      lines.push(`## Manifest Warnings (${result.manifest_warnings.length})`);
      result.manifest_warnings.forEach(warn => lines.push(`- ${warn}`));
      lines.push(``);
    }

    if (result.service_worker_errors.length > 0) {
      lines.push(`## Service Worker Issues (${result.service_worker_errors.length})`);
      result.service_worker_errors.forEach(err => lines.push(`- ${err}`));
      lines.push(``);
    }

    if (result.icons_missing.length > 0) {
      lines.push(`## Missing Icon Sizes`);
      result.icons_missing.forEach(size => lines.push(`- ${size}`));
      lines.push(``);
    }

    if (result.validation_errors.length > 0) {
      lines.push(`## Validation Errors (${result.validation_errors.length})`);
      result.validation_errors.forEach(err => lines.push(`- ${err}`));
    }

    return lines.join('\n');
  }
}
