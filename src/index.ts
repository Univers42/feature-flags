/**
 * Three-tier feature-flag resolution, generic over the host's flag-name union.
 *
 * Precedence, highest first:
 *   1. URL parameter  — `?my.flag=1` (query or hash), for a one-off override
 *   2. localStorage   — `my.flag`, for a sticky per-browser override
 *   3. build-time env — `VITE_MY_FLAG`, the deployed default
 *   4. the caller's `fallback`
 *
 * URL beats storage so a support link can override a stuck local value, and storage beats env so
 * a tester can pin a flag across reloads without a rebuild.
 *
 * Zero dependencies. Every ambient (`window`, `localStorage`, `import.meta.env`) is
 * feature-detected, so this resolves to the fallback under SSR or in a worker instead of throwing.
 */

export type FlagValueSource = 'url' | 'storage' | 'env' | 'fallback';

export interface FeatureFlagOptions {
  /**
   * Prefix used to derive the env/alternate key: `my.flag` → `VITE_MY_FLAG`.
   * Defaults to `VITE_` (Vite's convention for client-exposed variables).
   */
  envPrefix?: string;
  /**
   * Where to read build-time values from. Defaults to `import.meta.env` when present,
   * so a Vite host needs no configuration. Pass explicitly for other bundlers or in tests.
   */
  env?: Record<string, unknown>;
}

const TRUTHY = ['1', 'true', 'on', 'yes'];
const FALSY = ['0', 'false', 'off', 'no'];

/** `my.flag` → `VITE_MY_FLAG`. */
export function envKeyForFlag(name: string, envPrefix = 'VITE_'): string {
  return `${envPrefix}${name.toUpperCase().replaceAll('.', '_')}`;
}

/** Parse a flag string. Anything unrecognised yields `fallback`, never a silent `false`. */
export function flagValueToBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.toLowerCase();
  if (TRUTHY.includes(normalized)) return true;
  if (FALSY.includes(normalized)) return false;
  return fallback;
}

function defaultEnv(): Record<string, unknown> {
  return (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
}

function readUrlFlag(name: string, envPrefix: string): string | null {
  const win = (globalThis as { window?: Window }).window;
  if (win === undefined) return null;
  const alternate = envKeyForFlag(name, envPrefix);
  try {
    const search = new URLSearchParams(win.location.search);
    const hash = new URLSearchParams(win.location.hash.replace(/^#/, ''));
    return (
      search.get(name) ?? hash.get(name) ?? search.get(alternate) ?? hash.get(alternate)
    );
  } catch {
    return null;
  }
}

function readStoredFlag(name: string, envPrefix: string): string | null {
  const win = (globalThis as { window?: Window }).window;
  if (win === undefined) return null;
  try {
    return (
      win.localStorage.getItem(name) ?? win.localStorage.getItem(envKeyForFlag(name, envPrefix))
    );
  } catch {
    // localStorage throws in private mode / when cookies are blocked.
    return null;
  }
}

/** Which tier decided the value — useful for a debug panel. */
export function resolveFlagSource(name: string, options: FeatureFlagOptions = {}): FlagValueSource {
  const envPrefix = options.envPrefix ?? 'VITE_';
  if (readUrlFlag(name, envPrefix) !== null) return 'url';
  if (readStoredFlag(name, envPrefix) !== null) return 'storage';
  const env = options.env ?? defaultEnv();
  if (typeof env[envKeyForFlag(name, envPrefix)] === 'string') return 'env';
  return 'fallback';
}

export function isFeatureFlagEnabled(
  name: string,
  fallback = false,
  options: FeatureFlagOptions = {},
): boolean {
  const envPrefix = options.envPrefix ?? 'VITE_';

  const urlValue = readUrlFlag(name, envPrefix);
  if (urlValue !== null) return flagValueToBoolean(urlValue, fallback);

  const storedValue = readStoredFlag(name, envPrefix);
  if (storedValue !== null) return flagValueToBoolean(storedValue, fallback);

  const env = options.env ?? defaultEnv();
  const envValue = env[envKeyForFlag(name, envPrefix)];
  if (typeof envValue === 'string') return flagValueToBoolean(envValue, fallback);

  return fallback;
}

export interface FeatureFlags<TFlag extends string> {
  isEnabled(name: TFlag, fallback?: boolean): boolean;
  sourceOf(name: TFlag): FlagValueSource;
  keyFor(name: TFlag): string;
}

/**
 * Bind the resolver to a host's flag union so call sites are type-checked against the
 * declared set, and a typo is a compile error rather than a silently-false flag.
 *
 * ```ts
 * type AppFlag = 'app.canvas.v2' | 'app.search';
 * export const flags = createFeatureFlags<AppFlag>();
 * flags.isEnabled('app.canvas.v2', true);
 * ```
 */
export function createFeatureFlags<TFlag extends string>(
  options: FeatureFlagOptions = {},
): FeatureFlags<TFlag> {
  return {
    isEnabled: (name, fallback = false) => isFeatureFlagEnabled(name, fallback, options),
    sourceOf: (name) => resolveFlagSource(name, options),
    keyFor: (name) => envKeyForFlag(name, options.envPrefix ?? 'VITE_'),
  };
}
