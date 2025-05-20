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
        'dms-primary': '#2e7d32',
        'dms-secondary': '#4caf50',
        'dms-accent': '#8bc34a',
        'dms-text': '#333333',
        'dms-light-gray': '#f8f9fa',
        'dms-background': '#f1f8e9',
        // Chart colors (alpha is handled by opacity utilities)
        'dms-chart-green-dark': 'rgb(46, 125, 50)',
        'dms-chart-green-medium': 'rgb(76, 175, 80)',
        'dms-chart-green-light': 'rgb(139, 195, 74)',
        'dms-chart-green-olive': 'rgb(102, 187, 106)',
        'dms-chart-teal-dark': 'rgb(38, 166, 154)',
        'dms-chart-teal-medium': 'rgb(0, 150, 136)',
        'dms-chart-forest-green': 'rgb(67, 160, 71)',
        'dms-chart-olive-green': 'rgb(104, 159, 56)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
export default config 