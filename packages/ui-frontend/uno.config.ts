import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./public/icons/*.svg');

const collectionName = 'eitherway';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  accent: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#21c352',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  shortcuts: {
    'eitherway-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 eitherway-ease-cubic-bezier',
    kdb: 'bg-eitherway-elements-code-background text-eitherway-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    fontFamily: {
      syne: ['Syne', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      montserrat: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      righteous: ['Righteous', 'cursive'],
      mono: [
        'Azeret Mono',
        'ui-monospace',
        'SFMono-Regular',
        'Menlo',
        'Monaco',
        'Consolas',
        'Liberation Mono',
        'Courier New',
        'monospace',
      ],
      sans: ['Azeret Mono', 'ui-monospace', 'system-ui', 'sans-serif'],
    },
    colors: {
      ...COLOR_PRIMITIVES,
      eitherway: {
        elements: {
          borderColor: 'var(--eitherway-elements-borderColor)',
          borderColorActive: 'var(--eitherway-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--eitherway-elements-bg-depth-1)',
              2: 'var(--eitherway-elements-bg-depth-2)',
              3: 'var(--eitherway-elements-bg-depth-3)',
              4: 'var(--eitherway-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--eitherway-elements-textPrimary)',
          textSecondary: 'var(--eitherway-elements-textSecondary)',
          textTertiary: 'var(--eitherway-elements-textTertiary)',
          code: {
            background: 'var(--eitherway-elements-code-background)',
            text: 'var(--eitherway-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--eitherway-elements-button-primary-background)',
              backgroundHover: 'var(--eitherway-elements-button-primary-backgroundHover)',
              text: 'var(--eitherway-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--eitherway-elements-button-secondary-background)',
              backgroundHover: 'var(--eitherway-elements-button-secondary-backgroundHover)',
              text: 'var(--eitherway-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--eitherway-elements-button-danger-background)',
              backgroundHover: 'var(--eitherway-elements-button-danger-backgroundHover)',
              text: 'var(--eitherway-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--eitherway-elements-item-contentDefault)',
            contentActive: 'var(--eitherway-elements-item-contentActive)',
            contentAccent: 'var(--eitherway-elements-item-contentAccent)',
            contentDanger: 'var(--eitherway-elements-item-contentDanger)',
            backgroundDefault: 'var(--eitherway-elements-item-backgroundDefault)',
            backgroundActive: 'var(--eitherway-elements-item-backgroundActive)',
            backgroundAccent: 'var(--eitherway-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--eitherway-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--eitherway-elements-actions-background)',
            code: {
              background: 'var(--eitherway-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--eitherway-elements-artifacts-background)',
            backgroundHover: 'var(--eitherway-elements-artifacts-backgroundHover)',
            borderColor: 'var(--eitherway-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--eitherway-elements-artifacts-inlineCode-background)',
              text: 'var(--eitherway-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--eitherway-elements-messages-background)',
            linkColor: 'var(--eitherway-elements-messages-linkColor)',
            code: {
              background: 'var(--eitherway-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--eitherway-elements-messages-inlineCode-background)',
              text: 'var(--eitherway-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--eitherway-elements-icon-success)',
            error: 'var(--eitherway-elements-icon-error)',
            primary: 'var(--eitherway-elements-icon-primary)',
            secondary: 'var(--eitherway-elements-icon-secondary)',
            tertiary: 'var(--eitherway-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--eitherway-elements-preview-addressBar-background)',
              backgroundHover: 'var(--eitherway-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--eitherway-elements-preview-addressBar-backgroundActive)',
              text: 'var(--eitherway-elements-preview-addressBar-text)',
              textActive: 'var(--eitherway-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--eitherway-elements-terminals-background)',
            buttonBackground: 'var(--eitherway-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--eitherway-elements-dividerColor)',
          loader: {
            background: 'var(--eitherway-elements-loader-background)',
            progress: 'var(--eitherway-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--eitherway-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--eitherway-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--eitherway-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--eitherway-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--eitherway-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--eitherway-elements-cta-background)',
            text: 'var(--eitherway-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
