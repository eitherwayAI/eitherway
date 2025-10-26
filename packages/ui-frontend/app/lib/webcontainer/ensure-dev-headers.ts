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

  // WebContainer needs permissive CORS with COEP: credentialless
  // This enables cross-origin isolation while allowing external resources
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

  // Check if server config with CORS already exists
  if (original.includes("server:") && original.includes("cors: true")) {
    console.log('[ensureDevHeaders] Server config already exists, skipping');
    return;
  }

  // Inject CORS and COEP headers if not present
  let updated = original;
  console.log('[ensureDevHeaders] Injecting cross-origin headers...');
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
  console.log('[ensureDevHeaders] Injected cross-origin headers successfully into', sessionConfigPath);
}
