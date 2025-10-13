import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './files';

const logger = createScopedLogger('ArtifactValidator');

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

export interface PageManifest {
  pages: Array<{ slug: string; title: string; route: string }>;
  router: 'mpa' | 'spa';
  features: string[];
}

export class ArtifactValidator {
  validateGeneratedArtifact(files: FileMap, manifest?: PageManifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!files['index.html'] && !files['/index.html']) {
      errors.push('Missing required index.html file');
    }

    const indexFile = files['index.html'] || files['/index.html'];
    if (indexFile?.type === 'file') {
      const content = indexFile.content;

      if (content.includes('<style>') && content.includes('</style>')) {
        errors.push('Found inline <style> tags in HTML - all styles must be in styles.css');
      }

      if (
        !content.includes('<link rel="stylesheet" href="/styles.css">') &&
        !content.includes('<link rel="stylesheet" href="styles.css">') &&
        !content.includes('<link rel="stylesheet" href="./styles.css">')
      ) {
        warnings.push('index.html does not link to styles.css');
      }
    }

    if (!files['styles.css'] && !files['/styles.css']) {
      errors.push('Missing required styles.css file');
    }

    const stylesFile = files['styles.css'] || files['/styles.css'];
    if (stylesFile?.type === 'file') {
      const content = stylesFile.content;
      if (!content.includes(':root')) {
        warnings.push('styles.css missing :root CSS variables');
      }
    }

    if (manifest) {
      this.validateManifest(files, manifest, errors, warnings);
    }

    const htmlFiles = Object.keys(files).filter((path) => path.endsWith('.html') && files[path]?.type === 'file');

    for (const htmlPath of htmlFiles) {
      const htmlFile = files[htmlPath];
      if (htmlFile?.type === 'file') {
        this.validateHtmlFile(htmlPath, htmlFile.content, errors, warnings);
      }
    }

    const success = errors.length === 0;

    if (errors.length > 0) {
      logger.error('Validation failed:', errors);
    }

    if (warnings.length > 0) {
      logger.warn('Validation warnings:', warnings);
    }

    return { success, errors, warnings };
  }

  private validateManifest(files: FileMap, manifest: PageManifest, errors: string[], warnings: string[]): void {
    if (manifest.router === 'mpa') {
      for (const page of manifest.pages) {
        if (page.slug === 'index') continue;

        const expectedPaths = [`/pages/${page.slug}.html`, `pages/${page.slug}.html`];

        const exists = expectedPaths.some((path) => files[path]?.type === 'file');
        if (!exists) {
          errors.push(`Missing page file for route: ${page.route} (expected /pages/${page.slug}.html)`);
        }
      }
    }

    if (!files['/scripts/nav.js'] && !files['scripts/nav.js'] && manifest.pages.length > 1) {
      warnings.push('Multi-page app missing navigation script (scripts/nav.js)');
    }
  }

  private validateHtmlFile(path: string, content: string, errors: string[], warnings: string[]): void {
    const hasStyleTags = /<style[^>]*>[\s\S]*?<\/style>/i.test(content);
    if (hasStyleTags) {
      errors.push(`${path}: Contains inline <style> tags - move to styles.css`);
    }

    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      if (href.startsWith('#') || href.startsWith('http') || href.startsWith('//')) {
        continue;
      }

      if (href.includes('{{') || href.includes('${')) {
        continue;
      }
    }

    const hasDataPattern = /data-pattern=["'][^"']+["']/i.test(content);
    if (path === 'index.html' || path === '/index.html') {
      if (!hasDataPattern) {
        warnings.push('index.html missing data-pattern attribute on <html> element');
      }
    }
  }

  validateWalletConnection(files: FileMap): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const hasEnvExample = files['.env.example'] || files['/.env.example'];
    if (!hasEnvExample) {
      errors.push('Missing .env.example file for Web3 configuration');
    } else if (hasEnvExample.type === 'file') {
      const content = hasEnvExample.content;
      if (!content.includes('WALLETCONNECT_PROJECT_ID')) {
        errors.push('.env.example missing WALLETCONNECT_PROJECT_ID');
      }
      if (!content.includes('RPC_URL')) {
        warnings.push('.env.example missing RPC_URL configuration');
      }
    }

    const jsFiles = Object.keys(files).filter(
      (path) => (path.endsWith('.js') || path.endsWith('.ts')) && files[path]?.type === 'file',
    );

    let hasWalletConnect = false;
    for (const jsPath of jsFiles) {
      const jsFile = files[jsPath];
      if (jsFile?.type === 'file') {
        const content = jsFile.content;
        if (content.includes('createAppKit') || content.includes('wagmi') || content.includes('WalletConnect')) {
          hasWalletConnect = true;

          if (content.includes('Math.random()') && (content.includes('walletAddress') || content.includes('0x'))) {
            errors.push(`${jsPath}: Using Math.random() for wallet addresses - use real wallet connection`);
          }
        }
      }
    }

    const success = errors.length === 0;
    return { success, errors, warnings };
  }

  validateChangeSet(
    changeSet: { operations: Array<{ kind: string; path: string }> },
    intent: 'MODIFY' | 'CREATE' | 'REWRITE',
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const criticalFiles = new Set([
      'index.html',
      '/index.html',
      'main.js',
      '/main.js',
      'styles.css',
      '/styles.css',
      'base.css',
      '/base.css',
    ]);

    if (intent === 'MODIFY') {
      const recreatedFiles = changeSet.operations.filter((op) => op.kind === 'create' && criticalFiles.has(op.path));

      if (recreatedFiles.length > 0) {
        errors.push(
          `Refusing to recreate existing critical files during MODIFY: ${recreatedFiles.map((f) => f.path).join(', ')}`,
        );
      }
    }

    const touchedCss = changeSet.operations.some(
      (op) => op.path.endsWith('.css') && (op.kind === 'modify' || op.kind === 'create'),
    );

    if (touchedCss && !this.changedCssVariables(changeSet)) {
      warnings.push('CSS changed but no theme tokens updated - use :root CSS variables');
    }

    const success = errors.length === 0;
    return { success, errors, warnings };
  }

  private changedCssVariables(changeSet: any): boolean {
    return true;
  }

  validateDataCorrectness(portfolioData: any, isDemoMode: boolean): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isDemoMode && portfolioData.totalUsd > 0 && !portfolioData.holdings?.length) {
      errors.push('Portfolio shows positive value but no holdings - data integrity issue');
    }

    if (!isDemoMode && portfolioData.isDemo) {
      errors.push('Demo data being used without DEMO_MODE=true flag');
    }

    if (portfolioData.holdings) {
      for (const holding of portfolioData.holdings) {
        if (!holding.priceUsd && holding.valueUsd > 0) {
          errors.push(`Holding ${holding.symbol} has value but no price - invalid calculation`);
        }

        if (holding.confidence < 0.5 && holding.valueUsd > 0) {
          warnings.push(`Low confidence data for ${holding.symbol} being included in total`);
        }

        if (!holding.sources || holding.sources.length === 0) {
          errors.push(`Holding ${holding.symbol} has no data sources - provenance missing`);
        }
      }
    }

    if (portfolioData.provenance?.demo && !isDemoMode) {
      errors.push('Provenance indicates demo data but demo mode not enabled');
    }

    const success = errors.length === 0;
    return { success, errors, warnings };
  }

  validateStyleChanges(originalCss: string, modifiedCss: string, changeRequest: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const requestedColorChange = /change|set|update|color/i.test(changeRequest);

    if (requestedColorChange) {
      const originalVars = this.extractCssVariables(originalCss);
      const modifiedVars = this.extractCssVariables(modifiedCss);

      const changedVars = Object.keys(modifiedVars).filter((key) => originalVars[key] !== modifiedVars[key]);

      if (changedVars.length === 0) {
        errors.push('Color change requested but no CSS variables were modified');
      }

      const nonColorVarsChanged = changedVars.filter(
        (v) => !v.includes('color') && !v.includes('bg') && !v.includes('text') && !v.includes('accent'),
      );

      if (nonColorVarsChanged.length > 0) {
        warnings.push(`Non-color variables modified: ${nonColorVarsChanged.join(', ')}`);
      }
    }

    const success = errors.length === 0;
    return { success, errors, warnings };
  }

  private extractCssVariables(css: string): Record<string, string> {
    const vars: Record<string, string> = {};
    const rootMatch = css.match(/:root\s*{([^}]*)}/s);

    if (rootMatch) {
      const varRegex = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
      let match;
      while ((match = varRegex.exec(rootMatch[1])) !== null) {
        vars[match[1]] = match[2].trim();
      }
    }

    return vars;
  }
}

export const artifactValidator = new ArtifactValidator();
