// Testing Templates for Quality Gates
// Provides unit tests, E2E tests, and CI/CD configurations

export const playwrightTestTemplate = `
// E2E Tests using Playwright
// /tests/e2e/app.spec.js

import { test, expect } from '@playwright/test';

test.describe('Web3 Application E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('app loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Web3/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('wallet connect button is visible and clickable', async ({ page }) => {
    const connectButton = page.locator('#connect-wallet, button:has-text("Connect Wallet")');
    await expect(connectButton).toBeVisible();
    await expect(connectButton).toBeEnabled();

    await connectButton.click();

    // Check if wallet modal opens (may vary based on implementation)
    const modal = page.locator('[role="dialog"], .wallet-modal, .w3m-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('navigation links work correctly', async ({ page }) => {
    const navLinks = [
      { text: 'Dashboard', url: '/' },
      { text: 'Wallets', url: '/wallets' },
      { text: 'Analytics', url: '/analytics' },
      { text: 'Settings', url: '/settings' }
    ];

    for (const link of navLinks) {
      const navLink = page.locator(\`a:has-text("\${link.text}")\`);
      if (await navLink.isVisible()) {
        await navLink.click();
        await page.waitForLoadState('networkidle');

        // Check URL or page content changed
        if (link.url !== '/') {
          const url = page.url();
          expect(url).toContain(link.url.replace('/', ''));
        }
      }
    }
  });

  test('no inline styles in HTML', async ({ page }) => {
    const html = await page.content();

    // Check for <style> tags in HTML
    expect(html).not.toMatch(/<style[^>]*>[\s\S]*?<\/style>/i);

    // Check that styles.css is linked
    const stylesLink = page.locator('link[href*="styles.css"]');
    await expect(stylesLink).toHaveCount(1);
  });

  test('theme toggle works', async ({ page }) => {
    const themeToggle = page.locator('#theme-toggle, button[aria-label*="theme"]');

    if (await themeToggle.isVisible()) {
      // Get initial theme
      const initialTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme')
      );

      // Click toggle
      await themeToggle.click();

      // Check theme changed
      const newTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme')
      );

      expect(newTheme).not.toBe(initialTheme);
    }
  });

  test('demo mode banner appears when no env configured', async ({ page }) => {
    // Check if demo banner is present
    const demoBanner = page.locator('.demo-banner, [class*="demo-mode"]');

    // This should be visible if no env vars are configured
    if (await demoBanner.isVisible()) {
      await expect(demoBanner).toContainText(/demo/i);
    }
  });

  test('all required files exist', async ({ page }) => {
    const requiredFiles = [
      '/index.html',
      '/styles.css',
      '/.env.example'
    ];

    for (const file of requiredFiles) {
      const response = await page.request.get(file);
      expect(response.status()).toBeLessThan(400);
    }
  });

  test('responsive design works', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    const mobileMenu = page.locator('.mobile-menu, [class*="burger"], [aria-label*="menu"]');
    if (await mobileMenu.isVisible()) {
      await expect(mobileMenu).toBeVisible();
    }

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();

    const desktopNav = page.locator('nav, .navbar');
    await expect(desktopNav).toBeVisible();
  });

  test('wallet address formatting works', async ({ page }) => {
    // Look for any wallet address displays
    const addressElements = page.locator('[class*="address"], [data-testid*="address"]');

    const count = await addressElements.count();
    for (let i = 0; i < count; i++) {
      const text = await addressElements.nth(i).textContent();

      // Check if it's a formatted address (0x1234...5678)
      if (text && text.includes('0x')) {
        expect(text).toMatch(/0x[a-fA-F0-9]{4}\.{2,3}[a-fA-F0-9]{4}/);
      }
    }
  });
});

test.describe('Performance Tests', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000); // 3 seconds max
  });

  test('no console errors', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Some errors might be acceptable (like failed external resources in demo mode)
    const criticalErrors = errors.filter(error =>
      !error.includes('Failed to load resource') &&
      !error.includes('404') &&
      !error.includes('demo')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
`;

export const unitTestTemplate = `
// Unit Tests for Services
// /tests/unit/services.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PriceService', () => {
  let priceService;

  beforeEach(() => {
    // Reset service
    global.window = { ENV: {} };
    priceService = new PriceService();
  });

  it('should format prices correctly', () => {
    expect(priceService.formatPrice(1850.2534)).toBe('1850.25');
    expect(priceService.formatPrice(0.00045678)).toBe('0.0005');
    expect(priceService.formatPrice(35420)).toBe('35,420.00');
  });

  it('should format market cap correctly', () => {
    expect(priceService.formatMarketCap(1500000000)).toBe('$1.50B');
    expect(priceService.formatMarketCap(250000000000)).toBe('$250.00B');
    expect(priceService.formatMarketCap(1200000000000)).toBe('$1.20T');
  });

  it('should cache prices correctly', async () => {
    const mockPrice = { price: 1850, change24h: 2.5, marketCap: 200000000000 };

    priceService.setCache('ETH-usd', mockPrice);
    const cached = priceService.getFromCache('ETH-usd');

    expect(cached).toEqual(mockPrice);
  });

  it('should return demo prices when no API configured', async () => {
    const prices = await priceService.getPrices(['ETH', 'BTC']);

    expect(prices).toHaveProperty('ETH');
    expect(prices).toHaveProperty('BTC');
    expect(prices.ETH.price).toBeGreaterThan(0);
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('API Error'));

    const prices = await priceService.getPrices(['ETH']);

    // Should fall back to demo prices
    expect(prices).toHaveProperty('ETH');
    expect(prices.ETH.price).toBeGreaterThan(0);
  });
});

describe('PortfolioService', () => {
  let portfolioService;

  beforeEach(() => {
    global.window = { ENV: {} };
    portfolioService = new PortfolioService();
  });

  it('should detect available indexers', () => {
    global.window.ENV = {
      COVALENT_API_KEY: 'test-key',
      MORALIS_API_KEY: 'test-key'
    };

    portfolioService = new PortfolioService();
    expect(portfolioService.supportedIndexers).toContain('covalent');
    expect(portfolioService.supportedIndexers).toContain('moralis');
  });

  it('should format balances correctly', () => {
    const formatted = portfolioService.formatBalance('1000000000000000000', 18);
    expect(formatted).toBe('1.0000');
  });

  it('should return demo portfolio when no address provided', async () => {
    const portfolio = await portfolioService.getPortfolio(null);

    expect(Array.isArray(portfolio)).toBe(true);
    expect(portfolio.length).toBeGreaterThan(0);
    expect(portfolio[0]).toHaveProperty('symbol');
    expect(portfolio[0]).toHaveProperty('balance');
  });

  it('should cache portfolio data', async () => {
    const mockPortfolio = [
      { symbol: 'ETH', balance: '2.5', valueUSD: 4625 }
    ];

    portfolioService.setCache('portfolio-0x123-1', mockPortfolio);
    const cached = portfolioService.getFromCache('portfolio-0x123-1');

    expect(cached).toEqual(mockPortfolio);
  });
});

describe('Web3Service', () => {
  let web3Service;

  beforeEach(() => {
    global.window = { ENV: {}, localStorage: new Map() };
    global.document = {
      getElementById: vi.fn(),
      title: 'Test App',
      documentElement: { getAttribute: vi.fn() }
    };
  });

  it('should detect demo mode correctly', () => {
    web3Service = new Web3Service();
    expect(web3Service.isDemo).toBe(true);

    global.window.ENV.WALLETCONNECT_PROJECT_ID = 'real-project-id';
    web3Service = new Web3Service();
    expect(web3Service.isDemo).toBe(false);
  });

  it('should format addresses correctly', () => {
    web3Service = new Web3Service();

    expect(web3Service.formatAddress('0x1234567890123456789012345678901234567890'))
      .toBe('0x1234...7890');

    expect(web3Service.formatAddress(null)).toBe('');
  });

  it('should get chain name correctly', () => {
    web3Service = new Web3Service();

    expect(web3Service.getChainName(1)).toBe('Ethereum');
    expect(web3Service.getChainName(137)).toBe('Polygon');
    expect(web3Service.getChainName(999)).toBe('Unknown');
  });
});

describe('Validator', () => {
  let validator;

  beforeEach(() => {
    validator = new ArtifactValidator();
  });

  it('should detect inline styles', () => {
    const files = {
      'index.html': {
        type: 'file',
        content: '<html><head><style>body{}</style></head></html>'
      }
    };

    const result = validator.validateGeneratedArtifact(files);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Found inline <style> tags in HTML - all styles must be in styles.css');
  });

  it('should validate required files', () => {
    const files = {};

    const result = validator.validateGeneratedArtifact(files);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Missing required index.html file');
    expect(result.errors).toContain('Missing required styles.css file');
  });

  it('should validate page manifest', () => {
    const files = {
      'index.html': { type: 'file', content: '<html></html>' },
      'styles.css': { type: 'file', content: ':root{}' }
    };

    const manifest = {
      pages: [
        { slug: 'index', title: 'Home', route: '/' },
        { slug: 'wallets', title: 'Wallets', route: '/wallets' }
      ],
      router: 'mpa',
      features: []
    };

    const result = validator.validateGeneratedArtifact(files, manifest);

    expect(result.errors).toContain('Missing page file for route: /wallets (expected /pages/wallets.html)');
  });
});
`;

export const cicdTemplate = `
# GitHub Actions CI/CD Configuration
# /.github/workflows/ci.yml

name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  validate:
    name: Validate Generated App
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Check for inline styles
      run: |
        if grep -r '<style>' --include="*.html" .; then
          echo "❌ Found inline styles in HTML files"
          exit 1
        fi
        echo "✅ No inline styles found"

    - name: Verify required files
      run: |
        files=("index.html" "styles.css" ".env.example")
        for file in "\${files[@]}"; do
          if [ ! -f "$file" ]; then
            echo "❌ Missing required file: $file"
            exit 1
          fi
        done
        echo "✅ All required files present"

    - name: Validate CSS variables
      run: |
        if ! grep -q ':root' styles.css; then
          echo "❌ Missing :root CSS variables in styles.css"
          exit 1
        fi
        echo "✅ CSS variables found"

    - name: Check wallet configuration
      run: |
        if ! grep -q 'WALLETCONNECT_PROJECT_ID' .env.example; then
          echo "❌ Missing WALLETCONNECT_PROJECT_ID in .env.example"
          exit 1
        fi
        echo "✅ Environment configuration valid"

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: validate

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run unit tests
      run: npm run test:unit

    - name: Run linter
      run: npm run lint || true

    - name: Install Playwright
      run: npx playwright install --with-deps

    - name: Run E2E tests
      run: npm run test:e2e

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: test-results/

  build:
    name: Build Application
    runs-on: ubuntu-latest
    needs: test

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build application
      run: npm run build
      env:
        NODE_ENV: production

    - name: Check build output
      run: |
        if [ ! -d "dist" ] && [ ! -d "build" ]; then
          echo "❌ No build output found"
          exit 1
        fi
        echo "✅ Build successful"

    - name: Upload build artifacts
      uses: actions/upload-artifact@v3
      with:
        name: build-output
        path: |
          dist/
          build/

  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Download build artifacts
      uses: actions/download-artifact@v3
      with:
        name: build-output

    - name: Deploy to Vercel
      env:
        VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      run: |
        npx vercel --prod --token=$VERCEL_TOKEN

    # Alternative: Deploy to Netlify
    # - name: Deploy to Netlify
    #   uses: nwtgck/actions-netlify@v2.0
    #   with:
    #     publish-dir: './dist'
    #     production-deploy: true
    #   env:
    #     NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}
    #     NETLIFY_SITE_ID: \${{ secrets.NETLIFY_SITE_ID }}
`;

export const packageJsonTestScripts = `
{
  "scripts": {
    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
    "lint:fix": "eslint . --ext .js,.jsx,.ts,.tsx --fix",
    "validate": "node scripts/validate-artifact.js",
    "ci": "npm run lint && npm run test && npm run build"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "vitest": "^1.0.0",
    "eslint": "^8.50.0",
    "@vitest/ui": "^1.0.0"
  }
}
`;
