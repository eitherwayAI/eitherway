import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    ENV?: any;
    PAGE_MANIFEST?: any;
  }
}

test.describe('Data Correctness E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('empty wallet shows $0.00', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('walletAddress', '0x0000000000000000000000000000000000000000');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const totalValue = await page.locator('[data-testid="portfolio-total"], .portfolio-total, .total-value');

    if (await totalValue.isVisible()) {
      const text = await totalValue.textContent();
      expect(text).toMatch(/\$0\.00/);
      expect(text).not.toMatch(/\$[1-9]\d*/);
    }
  });

  test('demo mode shows banner when DEMO_MODE=true', async ({ page }) => {
    await page.evaluate(() => {
      window.ENV = { ...window.ENV, DEMO_MODE: 'true' };
    });

    await page.reload();

    const demoBanner = page.locator('.demo-banner, [role="status"]:has-text("Demo"), [class*="demo"]');
    await expect(demoBanner).toBeVisible();
    await expect(demoBanner).toContainText(/demo/i);
  });

  test('no phantom values without demo mode', async ({ page }) => {
    await page.evaluate(() => {
      window.ENV = { ...window.ENV, DEMO_MODE: 'false' };
      window.localStorage.removeItem('walletAddress');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const values = await page.locator('[class*="value"], [class*="balance"]').all();

    for (const value of values) {
      const text = await value.textContent();
      if (text?.includes('$')) {
        expect(text).not.toMatch(/\$[1-9]\d{3,}/);
      }
    }
  });

  test('provenance information is available', async ({ page }) => {
    const provenanceButton = page.locator('[aria-label*="provenance"], [title*="source"], button:has-text("ⓘ")');

    if (await provenanceButton.isVisible()) {
      await provenanceButton.click();

      const provenanceModal = page.locator('[role="dialog"], .provenance-modal, [class*="provenance"]');
      await expect(provenanceModal).toBeVisible();

      const content = await provenanceModal.textContent();
      expect(content).toMatch(/source|confidence|timestamp/i);
    }
  });
});

test.describe('File Modification Behavior', () => {
  test('style changes do not recreate files', async ({ page, request }) => {
    await page.goto('/');

    const initialResponse = await request.get('/styles.css');
    const initialCss = await initialResponse.text();

    await page.evaluate(() => {
      if (window.applyColorChange) {
        window.applyColorChange('set accent to #ff3e00');
      }
    });

    await page.waitForTimeout(1000);

    const modifiedResponse = await request.get('/styles.css');
    const modifiedCss = await modifiedResponse.text();

    expect(modifiedCss).toContain(':root');

    if (modifiedCss !== initialCss) {
      expect(modifiedCss).toMatch(/--[a-zA-Z-]+:\s*#ff3e00/);
    }
  });

  test('no inline styles after generation', async ({ page }) => {
    const hasInlineStyles = await page.evaluate(() => {
      const styleElements = document.querySelectorAll('style');
      return styleElements.length > 0;
    });

    expect(hasInlineStyles).toBe(false);

    const hasStylesheetLink = await page.evaluate(() => {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      return Array.from(links).some(link =>
        link.getAttribute('href')?.includes('styles.css')
      );
    });

    expect(hasStylesheetLink).toBe(true);
  });
});

test.describe('Navigation Integrity', () => {
  test('all navigation links work', async ({ page }) => {
    const navLinks = await page.locator('nav a, .sidebar a, [role="navigation"] a').all();

    for (const link of navLinks) {
      const href = await link.getAttribute('href');

      if (href && !href.startsWith('#') && !href.startsWith('http')) {
        await link.click();
        await page.waitForLoadState('networkidle');

        const response = page.context().pages()[0].url();
        expect(response).not.toContain('404');
      }
    }
  });

  test('page manifest matches actual pages', async ({ page, request }) => {
    const manifestScript = await page.evaluate(() => {
      return window.PAGE_MANIFEST || null;
    });

    if (manifestScript) {
      for (const pageInfo of manifestScript.pages) {
        if (pageInfo.slug !== 'index') {
          const response = await request.get(`/pages/${pageInfo.slug}.html`);
          expect(response.status()).toBeLessThan(400);
        }
      }
    }
  });
});

test.describe('Performance and Reliability', () => {
  test('portfolio loads without errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('404')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const criticalErrors = errors.filter(e =>
      e.includes('portfolio') ||
      e.includes('price') ||
      e.includes('balance')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('values update only with valid data', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('portfolio-update', {
        detail: {
          holdings: [],
          totalUsd: 0,
          confidence: 'none'
        }
      }));
    });

    await page.waitForTimeout(500);

    const total = await page.locator('[data-testid="portfolio-total"]').textContent();
    expect(total).toMatch(/\$0/);
  });
});