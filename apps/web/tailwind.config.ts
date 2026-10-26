import type { Config } from 'tailwindcss';

/**
 * Sistema de color Konnexa, sacado del logo.
 *
 *   action (azul Konnexa #015EF7) → botones, estado activo, enlaces, datos.
 *   brand  (azul muy claro)       → superficies, tintes, bordes, avatares.
 *   mint   (verde Konnexa #0ACA62) → acento puntual y degradados de marca.
 *   ink    (azul marino #0B1630)  → texto.
 *
 * Contraste con texto blanco: action-500 #015EF7 = 5.3:1 y action-600 #0050D6
 * = 7.0:1, los dos AA. Todo botón con texto blanco usa action-600. El verde no
 * alcanza AA con texto pequeño encima (2.3:1): solo va en áreas sin texto o con
 * texto oscuro; para texto verde usar mint-700.
 * Los errores no usan el color de marca: van en rojo (rose de Tailwind).
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Montserrat', 'system-ui', 'sans-serif'],
        display: ['MontserratAlt', 'Montserrat', 'sans-serif'],
      },
      colors: {
        // Azules claros: superficies y tintes
        brand: {
          DEFAULT: '#E6EEFF',
          50:  '#F3F7FF',
          100: '#E6EEFF',
          200: '#CCDCFF',
          300: '#A3C0FF',
          400: '#6E9BFF',
          500: '#3D78FB',
          600: '#1F63F0',
          700: '#0F4FC8',
          800: '#0B3D96',
          900: '#082A66',
        },
        // Azul Konnexa: acciones y estado activo
        action: {
          DEFAULT: '#015EF7',
          50:  '#EEF4FF',
          100: '#DCE8FF',
          200: '#B9D0FF',
          300: '#8AB0FF',
          400: '#4F87FB',
          500: '#015EF7',
          600: '#0050D6',
          700: '#0041B0',
          800: '#00348C',
          900: '#001380',
        },
        // Verde Konnexa: acento
        mint: {
          DEFAULT: '#0ACA62',
          50:  '#E9FBF1',
          100: '#CFF6E1',
          300: '#6DE3A3',
          500: '#0ACA62',
          600: '#08A851',
          700: '#067A3B',
        },
        // Texto: azul marino del logotipo
        ink: {
          DEFAULT: '#0B1630',
          soft:    '#33405E',
          muted:   '#66728C',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
