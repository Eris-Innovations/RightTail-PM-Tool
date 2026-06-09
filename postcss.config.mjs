// Tailwind v4's PostCSS plugin is the canonical way to wire Tailwind into
// Next.js. The Vite plugin (@tailwindcss/vite) doesn't apply here because
// Next runs PostCSS for CSS imports out of the box.

export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
