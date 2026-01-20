import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Discord's Blurple color palette
        blurple: {
          50: '#f0f1ff',
          100: '#e0e4ff',
          200: '#c7cdff',
          300: '#a5aeff',
          400: '#7d85ff',
          500: '#5865F2', // Main Discord Blurple
          600: '#4752c4',
          700: '#3c45a5',
          800: '#2f3681',
          900: '#282e5c',
        },
        // Discord Dark Mode colors
        discord: {
          darker: '#1e1f22',
          dark: '#2b2d31',
          medium: '#313338',
          light: '#383a40',
          text: '#dbdee1',
          muted: '#949ba4',
        },
        // Status colors
        success: '#23a559',
        danger: '#f23f43',
        warning: '#f0b232',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-blurple': 'linear-gradient(135deg, #5865F2 0%, #7d85ff 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
