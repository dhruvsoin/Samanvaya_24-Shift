/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#2563EB',
        background: '#F8FAFC',
        foreground: '#0F172A',
        primary: {
          DEFAULT: '#0F172A',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#F1F5F9',
          foreground: '#1E293B',
        },
        muted: {
          DEFAULT: '#F8FAFC',
          foreground: '#64748B',
        },
        accent: {
          DEFAULT: '#2563EB',
          foreground: '#FFFFFF',
        },
        gov: {
          canvas: '#F8FAFC',
          card: '#FFFFFF',
          subtle: '#F1F5F9',
          border: '#E2E8F0',
          borderDark: '#CBD5E1',
          text: '#0F172A',
          secondary: '#334155',
          muted: '#64748B',
          dim: '#94A3B8',
          blue: '#2563EB',
          blueHover: '#1D4ED8',
          blueLight: '#EFF6FF',
          emerald: '#059669',
          emeraldLight: '#ECFDF5',
          amber: '#D97706',
          amberLight: '#FFFBEB',
          rose: '#E11D48',
          roseLight: '#FFF1F2',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
        dropdown: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
