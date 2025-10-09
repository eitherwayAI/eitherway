type VarMap = Record<string, string>;

function extractRootVars(css: string): VarMap {
  const vars: VarMap = {};
  const match = css.match(/:root\s*{([\s\S]*?)}/);
  if (!match) return vars;
  const body = match[1];
  const rx = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body)) !== null) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

function buildRoot(vars: VarMap): string {
  const lines = Object.entries(vars)
    .map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

function replaceRoot(css: string, newRoot: string): string {
  if (/:root\s*{/.test(css)) {
    return css.replace(/:root\s*{[\s\S]*?}\s*/m, newRoot);
  }
  return `${newRoot}\n${css}`;
}

export function mergeStylesCss(
  incomingCss: string,
  existingCss: string,
  lockedColors: VarMap
): { css: string; updatedLock?: VarMap; explicitStyleChange: boolean } {
  const inVars = extractRootVars(incomingCss);
  const inColorKeys = Object.keys(inVars).filter(k => k.startsWith('color-'));
  const lockHas = Object.keys(lockedColors || {}).length > 0;

  let explicitStyleChange = false;
  let merged: VarMap = { ...inVars };

  if (!lockHas) {
    // First post-build modify: adopt incoming colors as the user's theme.
    const initialColors: VarMap = {};
    for (const k of inColorKeys) initialColors[k] = inVars[k];
    return {
      css: replaceRoot(incomingCss, buildRoot(merged)),
      updatedLock: initialColors,
      explicitStyleChange: true,
    };
  }

  // Heuristic: if most color vars changed from lock, treat as explicit theme change
  const total = inColorKeys.length || 1;
  const changed = inColorKeys.filter(k => lockedColors[k] && lockedColors[k] !== inVars[k]).length;
  explicitStyleChange = changed / total >= 0.6;

  if (!explicitStyleChange) {
    // Preserve locked colors
    for (const k of Object.keys(lockedColors)) {
      if (k.startsWith('color-')) {
        merged[k] = lockedColors[k];
      }
    }
    // Ensure any locked color missing in incoming is re-introduced
    for (const k of Object.keys(lockedColors)) {
      if (k.startsWith('color-') && !(k in merged)) merged[k] = lockedColors[k];
    }
    return {
      css: replaceRoot(incomingCss, buildRoot(merged)),
      explicitStyleChange: false,
    };
  }

  // Explicit change: accept incoming colors and refresh lock
  const newLock: VarMap = {};
  for (const k of inColorKeys) newLock[k] = inVars[k];
  return {
    css: replaceRoot(incomingCss, buildRoot(merged)),
    updatedLock: newLock,
    explicitStyleChange: true,
  };
}

