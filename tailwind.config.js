/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0041c8',
        'primary-container': '#0055ff',
        'primary-fixed': '#dce1ff',
        'on-primary': '#ffffff',
        secondary: '#bc000a',
        'secondary-container': '#e2241f',
        'on-secondary': '#ffffff',
        background: '#f8f9fa',
        surface: '#f8f9fa',
        'surface-container': '#edeeef',
        'surface-container-low': '#f3f4f5',
        'surface-container-high': '#e7e8e9',
        'surface-container-highest': '#e1e3e4',
        'on-surface': '#191c1d',
        'on-surface-variant': '#434656',
        outline: '#737688',
        'outline-variant': '#c3c5d9',
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
      fontFamily: {
        sans: ['Quicksand', 'sans-serif'],
        display: ['Quicksand', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
