// Mock for @env alias used in source files via babel-plugin-module-resolver
const Env = {
  EXPO_PUBLIC_APP_ENV: 'development' as const,
  EXPO_PUBLIC_NAME: 'Mi Remote (Dev)',
  EXPO_PUBLIC_PACKAGE_NAME: 'com.endless728.miremote',
  EXPO_PUBLIC_VERSION: '1.0.0',
};

export default Env;
export type AppEnv = typeof Env.EXPO_PUBLIC_APP_ENV;
