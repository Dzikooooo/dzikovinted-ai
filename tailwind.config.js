/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Rebrand (2026-07-28) : systeme violet a 3 roles distincts, valeurs
        // exactes donnees par l'utilisateur --
        // neon-500 = #7C5CFF (marque : logo, liens, accents graphiques)
        // neon-600 = #5B3FD9 (violet fonce : fond des CTA, texte blanc dessus)
        // neon-700 = #3B258F (violet tres fonce : hover des CTA, zones premium)
        // 500 reste le nom du token de base pour ne pas renommer ~150
        // references dans le code -- seule sa VALEUR change. 50-400/800-900
        // derives par degrade de luminosite a teinte/saturation constante
        // (approximatifs, usage marginal -- seuls 500/600/700 sont vraiment
        // utilises dans le produit).
        neon: {
          50: '#F3F0FF',
          100: '#E2DBFF',
          200: '#CABDFF',
          300: '#A994FF',
          400: '#957AFF',
          500: '#7C5CFF',
          600: '#5B3FD9',
          700: '#3B258F',
          800: '#2A1A66',
          900: '#1D123F',
        },
        dark: {
          50: '#1C202B',
          100: '#171A24',
          200: '#14171F',
          300: '#11131A',
          400: '#0F1117',
          500: '#0D0F14',
          600: '#0A0B0F',
          700: '#08090C',
          800: '#06070A',
          900: '#040506',
        },
        surface: {
          DEFAULT: '#1A1E28',
          alt: '#181B25',
        },
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'fade-in': 'fade-in 0.6s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%': {
            boxShadow:
              '0 0 5px rgba(124,92,255,0.25), 0 0 20px rgba(124,92,255,0.08)',
          },
          '100%': {
            boxShadow:
              '0 0 20px rgba(124,92,255,0.45), 0 0 60px rgba(124,92,255,0.18)',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
      },
    },
  },
  plugins: [],
};