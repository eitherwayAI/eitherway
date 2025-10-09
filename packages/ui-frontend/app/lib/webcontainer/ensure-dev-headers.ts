import type { WebContainer } from '@webcontainer/api';
import { WORK_DIR } from '~/utils/constants';

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

export async function ensureDevHeaders(webcontainer: WebContainer) {
  const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'].map(
    (n) => `${WORK_DIR}/${n}`,
  );

  let configPath: string | undefined;

  for (const path of candidates) {
    if (await fileExists(webcontainer, path)) {
      configPath = path;
      break;
    }
  }

  const headerLines = `server: { cors: true, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*' } },`;

  if (!configPath) {
    const content = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
export default defineConfig({ ${headerLines} plugins:[react()] })
`;
    await webcontainer.fs.writeFile(`${WORK_DIR}/vite.config.ts`, content);

    return;
  }

  const original = await readText(webcontainer, configPath);

  if (!original) {
    return;
  }

  if (original.includes('Cross-Origin-Embedder-Policy')) {
    return;
  }

  const idx = original.indexOf('defineConfig(');

  if (idx === -1) {
    return;
  }

  const braceIdx = original.indexOf('{', idx);

  if (braceIdx === -1) {
    return;
  }

  const updated = `${original.slice(0, braceIdx + 1)} ${headerLines} ${original.slice(braceIdx + 1)}`;
  await webcontainer.fs.writeFile(configPath, updated);
}
