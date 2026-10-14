/**
 * Centralized, Zod-validated environment configuration.
 *
 * This file is the single source of truth for ALL per-environment config:
 * app name, bundle IDs, packages, schemes, and runtime variables.
 *
 * Flow:
 *   1. `cp .env.staging .env.local` writes the active env file
 *   2. Expo CLI loads EXPO_PUBLIC_* vars from .env.local (highest priority)
 *   3. This file builds a typed env object with both process.env vars and computed per-env values
 *   4. `app.config.ts` imports Env for native config (name, bundle ID, package)
 *   5. Runtime code imports Env via `@env` alias for API URLs etc.
 *
 * Validation:
 *   - Set STRICT_ENV_VALIDATION=1 (in prebuild/build scripts) to throw on invalid vars
 *   - In dev, validation errors are logged as warnings but don't crash the app
 */

import { z } from 'zod';

import packageJSON from './package.json';

// ─────────────────────────────────────────────────────────────
//  Schema
// ─────────────────────────────────────────────────────────────

const envSchema = z.object({
  // App identity (computed from EXPO_PUBLIC_APP_ENV)
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']),
  EXPO_PUBLIC_NAME: z.string(),
  EXPO_PUBLIC_PACKAGE_NAME: z.string(),
  EXPO_PUBLIC_VERSION: z.string(),
});

// ─────────────────────────────────────────────────────────────
//  Per-environment config maps
// ─────────────────────────────────────────────────────────────

type AppEnvironment = z.infer<typeof envSchema>['EXPO_PUBLIC_APP_ENV'];

const EXPO_PUBLIC_APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as AppEnvironment;

const APP_NAMES: Record<AppEnvironment, string> = {
  development: 'Mi Remote (Dev)',
  staging: 'Mi Remote (Staging)',
  production: 'Mi Remote',
};

// Single package name shared across all environments.
// Keeps third-party service setup (Firebase, push notifications, signing) unified —
// one google-services.json / GoogleService-Info.plist works for every build.
const PACKAGE_NAME = 'com.endless728.miremote';

// ─── MULTI-PACKAGE ALTERNATIVE ────────────────────────────────────────────────
// Uncomment the block below (and remove the line above) if you need a distinct
// package name per environment so all three builds can be installed side-by-side
// on the same device.
//
// Steps to enable:
//   1. Replace PACKAGE_NAME with PACKAGE_NAMES below.
//   2. Change `EXPO_PUBLIC_PACKAGE_NAME: PACKAGE_NAME` → `PACKAGE_NAMES[EXPO_PUBLIC_APP_ENV]`
//      in the _env object further down.
//   3. Register each package name separately in Firebase (or any other service)
//      and ship the corresponding config file per environment.
//
// const PACKAGE_NAMES: Record<AppEnvironment, string> = {
//   development: 'com.endless728.miremote.dev',
//   staging:     'com.endless728.miremote.staging',
//   production:  'com.endless728.miremote',
// };
// ──────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  Build env object
// ─────────────────────────────────────────────────────────────

// Note: process.env.EXPO_PUBLIC_* must be referenced statically (dot notation)
// so Metro can inline them at bundle time. Do NOT use bracket notation or destructure.
const _env: z.infer<typeof envSchema> = {
  EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_NAME: APP_NAMES[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_PACKAGE_NAME: PACKAGE_NAME,
  EXPO_PUBLIC_VERSION: packageJSON.version,
};

// ─────────────────────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────────────────────

const STRICT_ENV_VALIDATION = process.env.STRICT_ENV_VALIDATION === '1';

function getValidatedEnv(env: z.infer<typeof envSchema>) {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const errorMessage =
      `❌ Invalid environment variables:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}` +
      `\n❌ Missing variables in .env file for APP_ENV=${EXPO_PUBLIC_APP_ENV}` +
      `\n💡 Tip: If you recently updated the .env file, try restarting with -c flag to clear the cache.`;

    if (STRICT_ENV_VALIDATION) {
      console.error(errorMessage);
      throw new Error('Invalid environment variables');
    }

    console.warn(errorMessage);
  } else {
    console.log('✅ Environment variables validated successfully');
  }

  return parsed.success ? parsed.data : env;
}

const Env = getValidatedEnv(_env);

export default Env;

export type AppEnv = typeof Env.EXPO_PUBLIC_APP_ENV;
