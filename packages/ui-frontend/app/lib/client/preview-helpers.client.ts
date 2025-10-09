// Client-only helpers for the Preview host window
// Provides small utilities like window.applyColorChange to patch /styles.css

import { webcontainer } from '~/lib/webcontainer';

declare global {
  interface Window {
    applyColorChange?: (instruction: string) => Promise<void>;
  }
}

function extractHex(input: string): string | null {
  const m = input.match(/#([0-9a-fA-F]{3,8})/);
  return m ? `#${m[1]}` : null;
}

async function ensureStylesFile(): Promise<string> {
  const wc = await webcontainer;
  try {
    const content = await wc.fs.readFile('/styles.css', 'utf8');
    return content as unknown as string;
  } catch {
    const initial = ':root{\n  --color-primary: #10b981;\n  --accent: #10b981;\n}\n';
    await wc.fs.writeFile('/styles.css', initial);
    return initial;
  }
}

async function writeStyles(content: string) {
  const wc = await webcontainer;
  await wc.fs.writeFile('/styles.css', content);
}

async function applyColorChange(instruction: string) {
  const hex = extractHex(instruction);
  if (!hex) return;

  const current = await ensureStylesFile();
  const override = `\n:root{\n  --accent: ${hex};\n  --color-primary: ${hex};\n}\n`;
  const next = current.includes(override) ? current : current + override;
  await writeStyles(next);
}

// Register on window
if (typeof window !== 'undefined') {
  window.applyColorChange = applyColorChange;
}

