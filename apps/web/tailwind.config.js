// const { createGlobPatternsForDependencies } = require('@nx/next/tailwind');

// The above utility import will not work if you are using Next.js' --turbo.
// Instead you will have to manually add the dependent paths to be included.
// For example
// ../libs/buttons/**/*.{ts,tsx,js,jsx,html}',                 <--- Adding a shared lib
// !../libs/buttons/**/*.{stories,spec}.{ts,tsx,js,jsx,html}', <--- Skip adding spec/stories files from shared lib

// If you are **not** using `--turbo` you can uncomment both lines 1 & 19.
// A discussion of the issue can be found: https://github.com/nrwl/nx/issues/26510

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './{src,pages,components,app}/**/*.{ts,tsx,js,jsx,html}',
    '!./{src,pages,components,app}/**/*.{stories,spec}.{ts,tsx,js,jsx,html}',
    //     ...createGlobPatternsForDependencies(__dirname)
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--bg-primary)',
        'surface-2': 'var(--bg-secondary)',
        subtle: 'var(--bg-subtle)',
        'subtle-hover': 'var(--bg-subtle-hover)',
        card: 'var(--bg-card)',
        'card-solid': 'var(--bg-card-solid)',
        fg: 'var(--text-primary)',
        'fg-secondary': 'var(--text-secondary)',
        'fg-muted': 'var(--text-muted)',
        line: 'var(--border-color)',
        input: 'var(--input-bg)',
        accent: 'var(--color-accent)',
        'accent-light': 'var(--color-accent-light)',
        'accent-muted': 'var(--color-accent-muted)',
        'accent-dim': 'var(--color-accent-dim)',
        'accent-surface': 'var(--color-accent-surface)',
      },
    },
  },
  plugins: [],
};
