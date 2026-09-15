# feature-flags

`@osionos/feature-flags` — three-tier feature-flag resolution, generic over the host's flag-name
union. Zero dependencies, SSR-safe.

## Precedence

| Tier | Source | Purpose |
|---|---|---|
| 1 | URL parameter — `?my.flag=1` (query **or** hash) | one-off override, shareable in a support link |
| 2 | `localStorage` — key `my.flag` | sticky per-browser override for testing |
| 3 | build-time env — `VITE_MY_FLAG` | the deployed default |
| 4 | the caller's `fallback` | when nothing is set |

URL beats storage so a link can override a value someone left stuck in their browser; storage
beats env so a tester can pin a flag across reloads without a rebuild.

Accepted spellings: `1/true/on/yes` and `0/false/off/no` (case-insensitive). **Anything
unrecognised resolves to the caller's `fallback`, never a silent `false`** — a typo must not
quietly disable a feature that defaults on.

## Type-safe flag sets

```ts
import { createFeatureFlags } from "@osionos/feature-flags";

export type AppFlag = "app.canvas.v2" | "app.search.unified";

export const flags = createFeatureFlags<AppFlag>();

flags.isEnabled("app.canvas.v2", true);   // default ON
flags.sourceOf("app.canvas.v2");          // 'url' | 'storage' | 'env' | 'fallback'
flags.keyFor("app.canvas.v2");            // 'VITE_APP_CANVAS_V2'
```

Binding the union means a typo is a compile error instead of a permanently-false flag. `sourceOf`
answers the question a debug panel actually needs: *why* is this flag in this state?

## API

```ts
isFeatureFlagEnabled(name, fallback?, options?): boolean
resolveFlagSource(name, options?): 'url' | 'storage' | 'env' | 'fallback'
envKeyForFlag(name, envPrefix?): string
flagValueToBoolean(value, fallback): boolean
createFeatureFlags<TFlag extends string>(options?): FeatureFlags<TFlag>

interface FeatureFlagOptions {
  envPrefix?: string;               // default 'VITE_'
  env?: Record<string, unknown>;    // default import.meta.env when present
}
```

`envPrefix` makes this usable outside Vite (`NEXT_PUBLIC_`, `REACT_APP_`, …). `env` is injectable
for tests and non-Vite bundlers; left alone it reads `import.meta.env` defensively.

Every ambient (`window`, `localStorage`, `import.meta.env`) is feature-detected, and a
`localStorage` that throws — private mode, blocked cookies — degrades to the next tier rather than
crashing the render that asked.

## Development

```sh
make help       # list targets
make check      # typecheck + tests
```
