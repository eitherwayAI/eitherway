import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--eitherway-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--eitherway-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--eitherway-elements-terminal-textColor'),
    background: cssVar('--eitherway-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--eitherway-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--eitherway-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--eitherway-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--eitherway-elements-terminal-color-black'),
    red: cssVar('--eitherway-elements-terminal-color-red'),
    green: cssVar('--eitherway-elements-terminal-color-green'),
    yellow: cssVar('--eitherway-elements-terminal-color-yellow'),
    blue: cssVar('--eitherway-elements-terminal-color-blue'),
    magenta: cssVar('--eitherway-elements-terminal-color-magenta'),
    cyan: cssVar('--eitherway-elements-terminal-color-cyan'),
    white: cssVar('--eitherway-elements-terminal-color-white'),
    brightBlack: cssVar('--eitherway-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--eitherway-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--eitherway-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--eitherway-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--eitherway-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--eitherway-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--eitherway-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--eitherway-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
