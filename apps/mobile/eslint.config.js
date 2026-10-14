const expoConfig = require('eslint-config-expo/flat.js');
const prettier = require('eslint-plugin-prettier/recommended');
const compiler = require('eslint-plugin-react-compiler');
const unistyles = require('eslint-plugin-react-native-unistyles');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  // 1. Basic Ignores
  {
    ignores: [
      '**/dist/*',
      '**/node_modules/*',
      '**/__tests__/*',
      '**/coverage/*',
      '**/.expo/*',
      '**/.expo-shared/*',
      '**/android/*',
      '**/ios/*',
      '**/.vscode/*',
      '**/docs/*',
      '**/cli/*',
      '**/expo-env.d.ts',
      '**/babel.config.js',
      '**/metro.config.js',
    ],
  },

  // 2. Base Expo Config
  ...expoConfig,

  // 3. Prettier Integration
  prettier,

  // 4. React Compiler
  {
    plugins: {
      'react-compiler': compiler,
    },
    rules: {
      'react-compiler/react-compiler': 'error',
    },
  },

  // 5. FIXED: Custom Rules + Import Overrides (No unrs-resolver)
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      'react-native-unistyles': unistyles,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          paths: ['src'],
        },
      },
      'import/ignore': ['node_modules', '\\.(scss|css)$'],
    },
    rules: {
      // DISABLE ALL import/* rules to prevent unrs-resolver errors
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/export': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-default': 'off',

      // Import Sorting
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000'], ['^react', '^@?\\w'], ['^@env', '^@/', '^'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',

      // Unused Imports - forcefully remove them
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Unistyles
      'react-native-unistyles/no-unused-styles': 'error',

      // React Native / Expo best practices
      'react/display-name': 'off',
      'react/no-inline-styles': 'off',
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          ignoreCase: true,
          reservedFirst: true,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['StyleSheet'],
              message:
                "Please use unistyles StyleSheet instead. import { StyleSheet } from 'react-native-unistyles'",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create'] > ObjectExpression",
          message:
            'StyleSheet.create should use a callback function: StyleSheet.create(() => ({ ... }))',
        },
        {
          // Atomic Zustand selectors. Every `use<Name>Store()` call MUST pass a
          // selector function so the subscription is scoped to a single field.
          // Without a selector, the component re-renders on ANY store change.
          //
          //   bad:   const { user, logout } = useUserStore();
          //   good:  const user   = useUserStore((s) => s.user);
          //          const logout = useUserStore((s) => s.logout);
          //
          // Non-subscribing API access stays unaffected because those calls go
          // through a MemberExpression callee (useUserStore.getState(),
          // useUserStore.persist.rehydrate(), useUserStore.subscribe(...)).
          selector:
            "CallExpression[callee.type='Identifier'][callee.name=/^use[A-Z].*Store$/][arguments.length=0]",
          message:
            'Zustand: pass an atomic selector — useFooStore((s) => s.field). Calling the hook with no arguments subscribes to the entire store and re-renders on every state change.',
        },
      ],
    },
  },

  // 6. TypeScript specific overrides
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // 7. Config files specific overrides (allow require)
  {
    files: ['*.config.js', 'app.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
];
