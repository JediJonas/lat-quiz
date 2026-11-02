// Kodstil och vanliga fel i appen, verktygen och testerna. Körs i CI med `npm run lint`.
// Reglerna är eslint:s rekommenderade plus några få som fångar fel, inte smak.
// Konfigurationen ligger här, så att appen förblir fri från beroenden. Den körs från repots
// rot med --config, och då gäller sökvägarna nedan från roten.
import js from '@eslint/js';
import globals from 'globals';

const shared = { ecmaVersion: 2024, sourceType: 'module' };

export default [
  { ignores: ['**/node_modules/', 'vendor/', '_site/'] },
  { files: ['**/*.js', '**/*.mjs'], ...js.configs.recommended },
  {
    files: ['js/**/*.js'],
    // Peer och qrcode kommer från vendor/ via script-taggar.
    languageOptions: { ...shared, globals: { ...globals.browser, Peer: 'readonly', qrcode: 'readonly' } },
  },
  {
    files: ['test/**/*.js', 'verktyg/**/*.mjs', 'webbkvalitet/**/*.mjs', 'webbkvalitet/**/*.js'],
    languageOptions: { ...shared, globals: { ...globals.node } },
  },
  {
    // Webbkvalitetens skript kör kod i webbläsaren via Playwright, där document finns.
    files: ['webbkvalitet/**/*.mjs'],
    languageOptions: { ...shared, globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
