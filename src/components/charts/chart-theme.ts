'use client';

import { useSyncExternalStore } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

/**
 * Chart theme derived from the CSS tokens declared in `src/app/globals.css`.
 * Colors are read at runtime from the document so this module never carries
 * hex literals and stays inside the visual contract by construction.
 */

export type ChartTone =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'energy'
  | 'error'
  | 'neutral';

export interface ChartTheme {
  tones: Record<ChartTone, string>;
  text: string;
  textSecondary: string;
  outline: string;
  surfaceElevated: string;
  fontFamily: string;
}

export const CHART_TONE_ORDER: ChartTone[] = [
  'primary',
  'secondary',
  'success',
  'warning',
  'energy',
  'error',
  'neutral',
];

const TOKEN_BY_TONE: Record<ChartTone, string> = {
  primary: '--primary',
  secondary: '--secondary',
  success: '--success',
  warning: '--warning',
  energy: '--energy',
  error: '--error',
  neutral: '--neutral',
};

let registered = false;

export function ensureChartRegistration() {
  if (registered) {
    return;
  }

  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
  );
  registered = true;
}

function readToken(styles: CSSStyleDeclaration, name: string) {
  return styles.getPropertyValue(name).trim();
}

export function readChartTheme(): ChartTheme | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const styles = getComputedStyle(document.documentElement);
  const tones = Object.fromEntries(
    CHART_TONE_ORDER.map((tone) => [tone, readToken(styles, TOKEN_BY_TONE[tone])]),
  ) as Record<ChartTone, string>;

  return {
    tones,
    text: readToken(styles, '--text'),
    textSecondary: readToken(styles, '--text-secondary'),
    outline: readToken(styles, '--outline'),
    surfaceElevated: readToken(styles, '--surface-elevated'),
    fontFamily: readToken(styles, '--font-sans-ui') || 'system-ui, sans-serif',
  };
}

export function hexToRgba(color: string, alpha: number) {
  const normalized = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(normalized);

  if (!match) {
    return normalized;
  }

  const hex = match[1].length === 3
    ? match[1].split('').map((char) => char + char).join('')
    : match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function toneColor(theme: ChartTheme, tone: ChartTone | undefined, index: number) {
  const resolvedTone = tone ?? CHART_TONE_ORDER[index % CHART_TONE_ORDER.length];
  return theme.tones[resolvedTone];
}

function applyChartDefaults(theme: ChartTheme) {
  ChartJS.defaults.color = theme.textSecondary;
  ChartJS.defaults.borderColor = theme.outline;
  ChartJS.defaults.font.family = theme.fontFamily;
  ChartJS.defaults.font.size = 12;
}

let cachedTheme: ChartTheme | null = null;

/**
 * Snapshot readers for `useSyncExternalStore`. The theme is read once from
 * the document (never on the server) and cached so the reference stays stable
 * across renders. Reading it also registers chart.js pieces and applies the
 * token defaults before the first chart instance is created.
 */
function getThemeSnapshot() {
  if (!cachedTheme) {
    const next = readChartTheme();
    if (next) {
      ensureChartRegistration();
      applyChartDefaults(next);
      cachedTheme = next;
    }
  }

  return cachedTheme;
}

function getServerThemeSnapshot(): ChartTheme | null {
  return null;
}

function subscribeToTheme() {
  return () => {};
}

export function useChartTheme() {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
}
