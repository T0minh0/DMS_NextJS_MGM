import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--text)',
        surface: 'var(--surface)',
        'surface-alt': 'var(--surface-alt)',
        'surface-elevated': 'var(--surface-elevated)',
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        outline: 'var(--outline)',
        'text-secondary': 'var(--text-secondary)',
        'dms-primary': 'var(--dms-primary)',
        'dms-secondary': 'var(--dms-secondary)',
        'dms-accent': 'var(--dms-accent)',
        'dms-text': 'var(--dms-text-color)',
        'dms-light-gray': 'var(--dms-light-gray)',
        'dms-background': 'var(--dms-background-color)',
      },
      fontFamily: {
        sans: ['var(--font-sans-ui)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono-ui)', 'monospace'],
      },
      spacing: {
        xxs: 'var(--space-xxs)',
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
        xxl: 'var(--space-xxl)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        glow: 'var(--shadow-glow)',
        'glow-hover': 'var(--shadow-glow-hover)',
      },
    },
  },
  plugins: [],
}

export default config
