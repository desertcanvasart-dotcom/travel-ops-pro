/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#647C47',
          50: '#F5F7F2',
          100: '#E8EDE0',
          200: '#D1DBC1',
          300: '#BAC9A2',
          400: '#92A873',
          500: '#647C47',
          600: '#536639',
          700: '#42502D',
          800: '#313A21',
          900: '#202416',
        },
        secondary: {
          DEFAULT: '#E9DBC8',
          50: '#FDFCFA',
          100: '#F9F5EE',
          200: '#F4EDE1',
          300: '#EEE5D4',
          400: '#E9DBC8',
          500: '#D5C1A8',
          600: '#C1A788',
          700: '#A88D68',
          800: '#8E7348',
          900: '#745928',
        },
        success: '#4CAF50',
        warning: '#F4A825',
        danger: '#E63838',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'autoura': '0 1px 3px 0 rgba(100, 124, 71, 0.1)',
        'autoura-lg': '0 10px 15px -3px rgba(100, 124, 71, 0.1)',
      }
    },
  },
  plugins: [],
}
