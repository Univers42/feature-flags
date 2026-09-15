import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createFeatureFlags,
  envKeyForFlag,
  flagValueToBoolean,
  isFeatureFlagEnabled,
  resolveFlagSource,
} from "../src/index.ts";

type FakeWindow = {
  location: { search: string; hash: string };
  localStorage: { getItem(k: string): string | null };
};

function installWindow(opts: {
  search?: string;
  hash?: string;
  storage?: Record<string, string>;
  storageThrows?: boolean;
}): void {
  const store = opts.storage ?? {};
  const win: FakeWindow = {
    location: { search: opts.search ?? "", hash: opts.hash ?? "" },
    localStorage: {
      getItem(k) {
        if (opts.storageThrows) throw new Error("blocked");
        return k in store ? store[k] : null;
      },
    },
  };
  (globalThis as { window?: unknown }).window = win;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("envKeyForFlag derives the env variable name", () => {
  assert.equal(envKeyForFlag("osio.canvas.v2"), "VITE_OSIO_CANVAS_V2");
  assert.equal(envKeyForFlag("a.b", "NEXT_PUBLIC_"), "NEXT_PUBLIC_A_B");
});

test("flagValueToBoolean accepts the documented spellings", () => {
  for (const v of ["1", "true", "TRUE", "on", "yes"]) {
    assert.equal(flagValueToBoolean(v, false), true, v);
  }
  for (const v of ["0", "false", "off", "no"]) {
    assert.equal(flagValueToBoolean(v, true), false, v);
  }
});

test("flagValueToBoolean falls back on an unrecognised value", () => {
  assert.equal(flagValueToBoolean("banana", true), true);
  assert.equal(flagValueToBoolean("banana", false), false);
});

test("returns the fallback with no window (SSR / worker)", () => {
  assert.equal(isFeatureFlagEnabled("a.b", true, { env: {} }), true);
  assert.equal(isFeatureFlagEnabled("a.b", false, { env: {} }), false);
  assert.equal(resolveFlagSource("a.b", { env: {} }), "fallback");
});

test("env supplies the deployed default", () => {
  installWindow({});
  const env = { VITE_A_B: "1" };
  assert.equal(isFeatureFlagEnabled("a.b", false, { env }), true);
  assert.equal(resolveFlagSource("a.b", { env }), "env");
});

test("storage overrides env", () => {
  installWindow({ storage: { "a.b": "0" } });
  const env = { VITE_A_B: "1" };
  assert.equal(isFeatureFlagEnabled("a.b", false, { env }), false);
  assert.equal(resolveFlagSource("a.b", { env }), "storage");
});

test("url overrides storage and env", () => {
  installWindow({ search: "?a.b=1", storage: { "a.b": "0" } });
  const env = { VITE_A_B: "0" };
  assert.equal(isFeatureFlagEnabled("a.b", false, { env }), true);
  assert.equal(resolveFlagSource("a.b", { env }), "url");
});

test("the hash carries a flag too", () => {
  installWindow({ hash: "#a.b=1" });
  assert.equal(isFeatureFlagEnabled("a.b", false, { env: {} }), true);
});

test("the env-style key also works in the URL", () => {
  installWindow({ search: "?VITE_A_B=1" });
  assert.equal(isFeatureFlagEnabled("a.b", false, { env: {} }), true);
});

test("a throwing localStorage degrades instead of crashing", () => {
  installWindow({ storageThrows: true });
  assert.doesNotThrow(() => isFeatureFlagEnabled("a.b", true, { env: {} }));
  assert.equal(isFeatureFlagEnabled("a.b", true, { env: {} }), true);
});

test("a non-string env value is ignored", () => {
  installWindow({});
  assert.equal(isFeatureFlagEnabled("a.b", true, { env: { VITE_A_B: 1 } }), true);
  assert.equal(isFeatureFlagEnabled("a.b", false, { env: { VITE_A_B: 1 } }), false);
});

test("createFeatureFlags binds options and exposes the key", () => {
  installWindow({});
  const flags = createFeatureFlags<"a.b">({ env: { VITE_A_B: "1" } });
  assert.equal(flags.isEnabled("a.b"), true);
  assert.equal(flags.sourceOf("a.b"), "env");
  assert.equal(flags.keyFor("a.b"), "VITE_A_B");
});

test("a custom env prefix is honoured end to end", () => {
  installWindow({});
  const flags = createFeatureFlags<"a.b">({
    envPrefix: "NEXT_PUBLIC_",
    env: { NEXT_PUBLIC_A_B: "on" },
  });
  assert.equal(flags.isEnabled("a.b"), true);
});
