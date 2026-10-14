/**
 * Node-side .env loader.
 *
 * Imported ONLY by `app.config.ts` (and any other Node-only entry point that
 * needs env vars before evaluating `./env`). NEVER import this from runtime
 * code — it pulls in `dotenv` and `path`, which Metro cannot bundle.
 *
 * Why this file exists:
 *   - `expo start` / `expo run:*` already auto-load .env files via @expo/env,
 *     but only the ones tied to NODE_ENV (development | test | production),
 *     so .env.staging is never picked up automatically.
 *   - When EAS CLI's pre-flight `npx expo config` fails, EAS falls back to a
 *     bundled `@expo/config` that does NOT run @expo/env, leaving process.env
 *     empty and breaking schema validation in `./env`.
 *   - Loading dotenv here makes env resolution deterministic across every
 *     context (Expo CLI, EAS CLI fallback, plain Node, EAS cloud builders).
 *
 * Resolution order (later loads do NOT overwrite earlier ones — process.env wins):
 *   - Explicit env mode (APP_ENV or EXPO_PUBLIC_APP_ENV was set by the command):
 *     1. process.env
 *     2. .env.<APP_ENV>.local
 *     3. .env.<APP_ENV>
 *     4. .env.local
 *     5. .env
 *   - Implicit/default mode (no explicit env in command):
 *     1. process.env
 *     2. .env.<APP_ENV>.local
 *     3. .env.local
 *     4. .env.<APP_ENV>
 *     5. .env
 *
 * The explicit mode prevents a stale `.env.local` (for example development)
 * from overriding `APP_ENV=production` or `APP_ENV=staging`.
 *
 * APP_ENV is resolved from process.env.APP_ENV → process.env.EXPO_PUBLIC_APP_ENV
 * → 'development'. EXPO_PUBLIC_APP_ENV is then mirrored back into process.env so
 * Metro inlines the correct value into the JS bundle.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'path';

const requestedAppEnv = process.env.APP_ENV ?? process.env.EXPO_PUBLIC_APP_ENV;
const APP_ENV = requestedAppEnv ?? 'development';
const hasExplicitAppEnv = Boolean(requestedAppEnv);

// Mirror APP_ENV onto EXPO_PUBLIC_APP_ENV so it gets inlined by Metro at bundle time.
if (!process.env.EXPO_PUBLIC_APP_ENV) {
  process.env.EXPO_PUBLIC_APP_ENV = APP_ENV;
}

const ENV_FILES = hasExplicitAppEnv
  ? [`.env.${APP_ENV}.local`, `.env.${APP_ENV}`, '.env.local', '.env']
  : [`.env.${APP_ENV}.local`, '.env.local', `.env.${APP_ENV}`, '.env'];

for (const file of ENV_FILES) {
  dotenvConfig({
    path: path.resolve(__dirname, file),
    override: false,
  });
}
