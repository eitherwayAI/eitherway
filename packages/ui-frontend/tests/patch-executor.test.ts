import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatchExecutor } from '~/lib/.server/edits/patch-executor';
// import { StyleManager } from '~/lib/style/style-manager'; // Module doesn't exist
import { artifactValidator } from '~/lib/stores/artifact-validator';

describe('PatchExecutor - File Recreation Prevention', () => {
  let executor: PatchExecutor;

  beforeEach(() => {
    executor = new PatchExecutor();
    vi.clearAllMocks();
  });

  it('should refuse to recreate existing critical files', async () => {
    vi.spyOn(executor as any, 'fileExists').mockResolvedValue(true);

    const result = await executor.applyEdits([
      {
        kind: 'create',
        path: 'index.html',
        content: '<html>new content</html>'
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Refusing to recreate existing critical file');
    expect(result.operations).toHaveLength(0);
  });

  it('should allow modification of existing files', async () => {
    vi.spyOn(executor as any, 'readFile').mockResolvedValue('old content');
    vi.spyOn(executor as any, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(executor as any, 'hashContent').mockReturnValue('12345678');

    const result = await executor.applyEdits([
      {
        kind: 'modify',
        path: 'styles.css',
        beforeHash: '12345678',
        hunks: [
          {
            range: { start: 0, end: 11 },
            content: 'new content'
          }
        ]
      }
    ]);

    expect(result.success).toBe(true);
    expect(result.operations[0].kind).toBe('Modify');
    expect(result.operations[0].path).toBe('styles.css');
  });

  it('should verify hash before modification', async () => {
    vi.spyOn(executor as any, 'readFile').mockResolvedValue('current content');
    vi.spyOn(executor as any, 'hashContent').mockReturnValue('wronghash');

    const result = await executor.applyEdits([
      {
        kind: 'modify',
        path: 'main.js',
        beforeHash: 'expectedhash',
        hunks: []
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Hash mismatch');
  });

  it('should track operation types correctly', async () => {
    vi.spyOn(executor as any, 'fileExists').mockResolvedValue(false);
    vi.spyOn(executor as any, 'writeFile').mockResolvedValue(undefined);

    const result = await executor.applyEdits([
      {
        kind: 'create',
        path: 'new-file.js',
        content: 'console.log("new");'
      }
    ]);

    expect(result.success).toBe(true);
    expect(result.operations[0].kind).toBe('Create');
  });
});

// StyleManager tests commented out - module doesn't exist
// describe('StyleManager - CSS Variable Updates', () => {
//   let manager: StyleManager;
//
//   beforeEach(() => {
//     manager = new StyleManager();
//     vi.clearAllMocks();
//   });
//
//   it('should update only CSS variables for color changes', async () => {
//     const mockCss = `:root {
//       --color-bg: #000000;
//       --color-text: #ffffff;
//     }`;
//
//     vi.spyOn(manager as any, 'readFile').mockResolvedValue(mockCss);
//     vi.spyOn(PatchExecutor.prototype, 'applyEdits').mockResolvedValue({
//       success: true,
//       operations: [],
//       errors: []
//     });
//
//     const result = await manager.updateThemeTokens({
//       'color-bg': '#1a1a1a',
//       'color-text': '#e0e0e0'
//     });
//
//     expect(result.success).toBe(true);
//     expect(result.changed).toContain('--color-bg');
//     expect(result.changed).toContain('--color-text');
//     expect(result.newValues['color-bg']).toBe('#1a1a1a');
//   });
//
//   it('should not recreate CSS file', async () => {
//     const mockCss = ':root { --color-primary: #000; }';
//     vi.spyOn(manager as any, 'readFile').mockResolvedValue(mockCss);
//
//     const applyEditsSpy = vi.spyOn(PatchExecutor.prototype, 'applyEdits').mockResolvedValue({
//       success: true,
//       operations: [],
//       errors: []
//     });
//
//     await manager.updateThemeTokens({ 'color-primary': '#fff' });
//
//     expect(applyEditsSpy).toHaveBeenCalledWith([
//       expect.objectContaining({
//         kind: 'modify',
//         path: '/styles.css'
//       })
//     ]);
//   });
//
//   it('should validate color values', async () => {
//     expect(await manager.validateColorValue('#ff0000')).toBe(true);
//     expect(await manager.validateColorValue('#f00')).toBe(true);
//     expect(await manager.validateColorValue('rgb(255, 0, 0)')).toBe(true);
//     expect(await manager.validateColorValue('rgba(255, 0, 0, 0.5)')).toBe(true);
//     expect(await manager.validateColorValue('not-a-color')).toBe(false);
//   });
// });

describe('ArtifactValidator - Enhanced Rules', () => {
  it('should detect file recreation attempts', () => {
    const changeSet = {
      operations: [
        { kind: 'create', path: 'index.html' },
        { kind: 'modify', path: 'styles.css' }
      ]
    };

    const result = artifactValidator.validateChangeSet(changeSet, 'MODIFY');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Refusing to recreate existing critical files');
  });

  it('should validate data correctness', () => {
    const portfolioData = {
      totalUsd: 1000,
      holdings: [],
      isDemo: true,
      provenance: { demo: true }
    };

    const result = artifactValidator.validateDataCorrectness(portfolioData, false);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Portfolio shows positive value but no holdings - data integrity issue');
    expect(result.errors).toContain('Demo data being used without DEMO_MODE=true flag');
  });

  it('should validate style changes', () => {
    const originalCss = ':root { --color-bg: #000; }';
    const modifiedCss = ':root { --color-bg: #000; }';

    const result = artifactValidator.validateStyleChanges(
      originalCss,
      modifiedCss,
      'change background color to blue'
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Color change requested but no CSS variables were modified');
  });

  it('should ensure provenance exists', () => {
    const portfolioData = {
      totalUsd: 0,
      holdings: [
        {
          symbol: 'ETH',
          valueUsd: 0,
          confidence: 0.8,
          sources: null
        }
      ]
    };

    const result = artifactValidator.validateDataCorrectness(portfolioData, false);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('has no data sources - provenance missing');
  });
});