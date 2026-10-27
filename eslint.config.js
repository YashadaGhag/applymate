// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// stories/tokens holds TypeScript stories; no TypeScript parser is configured, so they are not linted.
export default defineConfig([globalIgnores(['dist', 'storybook-static', 'stories/tokens']), {
  files: ['**/*.{js,jsx}'],
  ignores: ['server/**', 'shared/**'],
  extends: [
    js.configs.recommended,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    globals: globals.browser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}, {
  // Context files export a provider and its hook together on purpose.
  files: ['src/context/**/*.{js,jsx}'],
  rules: {
    'react-refresh/only-export-components': 'off',
  },
}, {
  // Config files run in Node, not in the browser.
  files: ['vite.config.js'],
  languageOptions: {
    globals: globals.node,
  },
}, {
  files: ['server/**/*.js'],
  extends: [js.configs.recommended],
  languageOptions: {
    globals: globals.node,
  },
}, {
  // shared/ is imported by the Node server and the Vite client alike: no DOM, no browser globals,
  // no Node-only APIs, no imports from src/ or server/ (tests excepted for the server).
  files: ['shared/**/*.js'],
  extends: [js.configs.recommended],
  languageOptions: {
    // Only the globals both environments have.
    globals: { ...globals.builtin, ...Object.fromEntries(Object.keys(globals.node).filter((g) => g in globals.browser).map((g) => [g, 'readonly'])) },
  },
  rules: {
    'no-restricted-globals': ['error',
      ...Object.keys(globals.browser).filter((g) => !(g in globals.node) && !(g in globals.builtin)).map((name) => ({ name, message: 'shared/ runs in both the browser and Node: no browser-only globals.' })),
      ...Object.keys(globals.node).filter((g) => !(g in globals.browser) && !(g in globals.builtin)).map((name) => ({ name, message: 'shared/ runs in both the browser and Node: no Node-only globals.' })),
    ],
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'crypto', 'url', 'util', 'stream', 'zlib', 'events', 'buffer'], message: 'shared/ must not use Node-only modules.' },
        { group: ['**/src/**', '**/server/**'], message: 'shared/ must not import from src/ or server/.' },
      ],
    }],
  },
}, {
  // Tests run in Node only; they may use node:test and import the server code they cover.
  files: ['shared/**/*.test.js'],
  languageOptions: { globals: globals.node },
  rules: { 'no-restricted-globals': 'off', 'no-restricted-imports': 'off' },
}, ...storybook.configs["flat/recommended"]])
