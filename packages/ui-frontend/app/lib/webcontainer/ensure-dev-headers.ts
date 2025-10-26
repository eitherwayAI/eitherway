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

  // WebContainer needs permissive CORS but NO COEP headers
  // COEP headers block npm install from StackBlitz CDN - only set them at platform level
  const headerLines = `server: { cors: true, host: true, headers: {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin'
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

  // Check if server config with CORS already exists
  if (original.includes("server:") && original.includes("cors: true")) {
    console.log('[ensureDevHeaders] Server config already exists, skipping');
    return;
  }

  // Remove any COEP headers if they exist (they break npm install in WebContainer)
  let updated = original;
  if (original.includes('Cross-Origin-Embedder-Policy')) {
    console.log('[ensureDevHeaders] Found COEP header, removing it (breaks npm install)');
    // Remove COEP header lines
    updated = updated.replace(
      /['"]Cross-Origin-Embedder-Policy['"]\s*:\s*['"][^'"]+['"]\s*,?\s*/g,
      '',
    );
    updated = updated.replace(
      /['"]Cross-Origin-Opener-Policy['"]\s*:\s*['"][^'"]+['"]\s*,?\s*/g,
      '',
    );
  }

  // Inject permissive CORS headers
  console.log('[ensureDevHeaders] Injecting CORS headers...');
  const idx = updated.indexOf('defineConfig(');

  if (idx === -1) {
    console.log('[ensureDevHeaders] No defineConfig found, skipping');
    return;
  }

  const braceIdx = updated.indexOf('{', idx);

  if (braceIdx === -1) {
    console.log('[ensureDevHeaders] No brace found after defineConfig, skipping');
    return;
  }

  const final = `${updated.slice(0, braceIdx + 1)} ${headerLines} ${updated.slice(braceIdx + 1)}`;
  await webcontainer.fs.writeFile(sessionConfigPath, final);
  console.log('[ensureDevHeaders] Injected CORS headers successfully into', sessionConfigPath);
}
