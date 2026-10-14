module.exports = function (api) {
  // Invalidate the cache when NODE_ENV changes so the production-only
  // transform-remove-console plugin below is picked up correctly.
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            // This alias rewrites `@env` to a relative path at transform time,
            // which happens BEFORE Jest applies `moduleNameMapper` — so the
            // `^@env$` mapping in jest.config.js never matches and cannot swap
            // in the mock. Pointing the alias itself at the mock under test is
            // what actually loads it; otherwise the real env.ts runs and warns
            // about missing variables, since no .env file is loaded in Jest.
            '@env': isTest ? './__mocks__/@env' : './env',
            // Local Expo module with the native TCP socket and TV discovery.
            milink: './modules/milink',
          },
        },
      ],
      [
        'react-native-unistyles/plugin',
        {
          root: 'src',
        },
      ],
      // Strip console.log / console.info / console.debug from production
      // bundles. Keep console.error and console.warn so crash reporters
      // (Sentry, Bugsnag, etc.) still receive them.
      ...(isProduction ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : []),
      // react-native-worklets/plugin MUST be the last plugin in the list.
      'react-native-worklets/plugin',
    ],
  };
};
