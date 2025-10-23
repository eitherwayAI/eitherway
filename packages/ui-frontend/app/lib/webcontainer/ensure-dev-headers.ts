import type { WebContainer } from '@webcontainer/api';

async function readText(webcontainer: WebContainer, path: string) {
  try {
    return await webcontainer.fs.readFile(path, 'utf-8');
  } catch {
    return undefined;
  }
}

async function fileExists(webcontainer: WebContainer, path: string) {
  try {
    await webcontainer.fs.readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDevHeaders(webcontainer: WebContainer, sessionRoot: string = '.') {
  console.log('[ensureDevHeaders] Starting header injection in session:', sessionRoot);
  const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];

  let configPath: string | undefined;
  let sessionConfigPath: string | undefined;

  for (const path of candidates) {
    const fullPath = sessionRoot === '.' ? path : `${sessionRoot}/${path}`;
    if (await fileExists(webcontainer, fullPath)) {
      configPath = path;
      sessionConfigPath = fullPath;
      console.log('[ensureDevHeaders] Found config:', fullPath);
      break;
    }
  }

  // WebContainer preview must use COEP: credentialless to allow opaque cross-origin fetches
  const headerLines = `server: { cors: true, headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*'
  } },`;

  if (!configPath || !sessionConfigPath) {
    console.log('[ensureDevHeaders] No config found, creating vite.config.ts with headers');
    const content = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
export default defineConfig({ ${headerLines} plugins:[react()] })
`;
    const newConfigPath = sessionRoot === '.' ? 'vite.config.ts' : `${sessionRoot}/vite.config.ts`;
    await webcontainer.fs.writeFile(newConfigPath, content);
    console.log('[ensureDevHeaders] Created vite.config.ts successfully at', newConfigPath);
    return;
  }

  const original = await readText(webcontainer, sessionConfigPath);

  if (!original) {
    return;
  }

  // Check if correct headers already exist
  if (original.includes('Cross-Origin-Embedder-Policy') && original.includes("'credentialless'")) {
    console.log('[ensureDevHeaders] Headers already correct, skipping');
    return; // Already has correct credentialless policy
  }

  // Fix incorrect require-corp policy by replacing it
  if (original.includes('Cross-Origin-Embedder-Policy')) {
    console.log('[ensureDevHeaders] Found incorrect COEP header, replacing with credentialless');
    // Remove existing COEP header section (might be require-corp)
    const updated = original.replace(
      /['"]Cross-Origin-Embedder-Policy['"]\s*:\s*['"]require-corp['"]/g,
      "'Cross-Origin-Embedder-Policy': 'credentialless'",
    );

    await webcontainer.fs.writeFile(sessionConfigPath, updated);
    console.log('[ensureDevHeaders] Updated config with credentialless');
    return;
  }

  // No COEP header exists, inject it
  console.log('[ensureDevHeaders] No COEP headers found, injecting...');
  const idx = original.indexOf('defineConfig(');

  if (idx === -1) {
    console.log('[ensureDevHeaders] No defineConfig found, skipping');
    return;
  }

  const braceIdx = original.indexOf('{', idx);

  if (braceIdx === -1) {
    console.log('[ensureDevHeaders] No brace found after defineConfig, skipping');
    return;
  }

  const updated = `${original.slice(0, braceIdx + 1)} ${headerLines} ${original.slice(braceIdx + 1)}`;
  await webcontainer.fs.writeFile(sessionConfigPath, updated);
  console.log('[ensureDevHeaders] Injected headers successfully into', sessionConfigPath);
}
