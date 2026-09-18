#!/usr/bin/env node
/**
 * Dev/build auth-flag invariant check.
 *
 * The dev server exposes its resolved client env at `GET /__app-env`
 * (see `scripts/app-env-plugin.mjs`). This script fetches the *live*
 * `VITE_AUTH_ENABLED` and compares it against the value the next build
 * will resolve (`.grok/app-env.json` merged under `process.env` — the same
 * logic as `scripts/with-app-env.mjs`).
 *
 * It exists to catch the case where Vite was started directly, bypassing
 * the wrapper: then the live server and the next build silently disagree
 * about `VITE_AUTH_ENABLED`, which only shows up as a built-output
 * mismatch long after the fact.
 *
 * Usage (dev server must already be running):
 *   node scripts/check-auth-invariant.mjs [--port 8080] [--timeout-ms 5000]
 *
 * Exit 0 when the invariant holds, 1 otherwise.
 */
import { APP_ENV_ROUTE } from "./app-env-plugin.mjs";
import { mergeAppEnv, projectRoot, readAppEnv } from "./with-app-env.mjs";

const KEY = "VITE_AUTH_ENABLED";

function parseArgs(argv) {
  const out = { port: 8080, timeoutMs: 5000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" && argv[i + 1] !== undefined) out.port = Number(argv[++i]);
    else if (arg === "--timeout-ms" && argv[i + 1] !== undefined) {
      out.timeoutMs = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      console.log("usage: node scripts/check-auth-invariant.mjs [--port 8080] [--timeout-ms 5000]");
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(out.port) || out.port <= 0) {
    console.error(`invalid --port: ${argv.join(" ")}`);
    process.exit(2);
  }
  return out;
}

async function fetchLiveEnv(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}${APP_ENV_ROUTE}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(`cannot reach dev server at ${url} (${err?.message || err})`);
  }
  if (!res.ok) {
    throw new Error(`dev server answered ${res.status} at ${url} — is appEnvPlugin loaded?`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error(`dev server answered non-JSON at ${url}`);
  }
}

async function main(argv) {
  const { port, timeoutMs } = parseArgs(argv);
  const root = projectRoot();
  const fileEnv = readAppEnv(root);
  const expected = mergeAppEnv(fileEnv, process.env)[KEY];
  const live = await fetchLiveEnv(port, timeoutMs).catch((err) => {
    console.error(`[check-auth-invariant] FAIL: ${err.message}`);
    process.exit(1);
  });
  const actual = live?.[KEY];

  console.log(`[check-auth-invariant] file (.grok/app-env.json): ${fileEnv[KEY] ?? "(unset)"}`);
  console.log(`[check-auth-invariant] expected (next build):     ${expected ?? "(unset)"}`);
  console.log(`[check-auth-invariant] live (dev :${port}):           ${actual ?? "(unset)"}`);

  // Warn (don't fail) on other file keys the live server disagrees about.
  for (const [key, value] of Object.entries(fileEnv)) {
    if (key === KEY) continue;
    const liveValue = live?.[key] ?? process.env[key];
    if (liveValue !== undefined && liveValue !== (process.env[key] ?? value)) {
      console.warn(`[check-auth-invariant] WARN: live ${key} disagrees with file value`);
    }
  }

  if (actual !== expected) {
    console.error(
      `[check-auth-invariant] FAIL: live ${KEY} does not match the next build. ` +
        `Was Vite started without scripts/with-app-env.mjs?`,
    );
    process.exit(1);
  }
  console.log("[check-auth-invariant] OK: live dev server agrees with the next build");
}

await main(process.argv.slice(2));
