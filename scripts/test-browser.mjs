import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = "http://127.0.0.1:5173/";
const environment = {
  ...process.env,
  VITE_API_URL: "http://127.0.0.1:8787",
  PLAYQR_TEST_URL: site,
  NO_COLOR: "1",
};
const suites = [
  "navigation-browser.mjs",
  "accounts-browser.mjs",
  "guest-browser.mjs",
  "select-browser.mjs",
  "sharing-browser.mjs",
  "release-polish-browser.mjs",
  "storage-browser.mjs",
  "ui-polish-browser.mjs",
  "action-buttons-browser.mjs",
];
const children = new Set();

function start(args, pipe = false) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: environment,
    stdio: pipe ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });
  children.add(child);
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    });
  });
  // Observe background-process errors immediately, including during startup.
  completion.catch(() => {});
  return { child, completion };
}

async function stopAll() {
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopAll();
    process.exitCode = signal === "SIGINT" ? 130 : 143;
  });
}

await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
const server = start(
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  true,
);
let serverOutput = "";
let startupTimer;
const startup = new Promise((resolve, reject) => {
  startupTimer = setTimeout(
    () =>
      reject(new Error("Local test server did not start within 20 seconds.")),
    20000,
  );
  server.child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    serverOutput += text;
    if (serverOutput.includes(site)) resolve();
  });
  server.child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.completion.then(
    () =>
      reject(
        new Error("Local test server could not start. " + serverOutput.trim()),
      ),
    reject,
  );
});

try {
  await startup;
  clearTimeout(startupTimer);
  const response = await fetch(site, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Local test server did not serve the app.");
  console.log(
    "Browser regressions use local API fixtures; production writes are disabled.",
  );
  for (const suite of suites) {
    if (process.exitCode) break;
    console.log(`Running ${suite}`);
    const test = start([
      fileURLToPath(new URL("../tests/" + suite, import.meta.url)),
    ]);
    const timer = setTimeout(() => test.child.kill("SIGTERM"), 180000);
    let result;
    try {
      result = await test.completion;
    } finally {
      clearTimeout(timer);
    }
    if (result.code !== 0)
      throw new Error(`${suite} failed (${result.signal || result.code}).`);
  }
  if (!process.exitCode)
    console.log(`PASS: ${suites.length} mocked browser suites.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(startupTimer);
  await stopAll();
  await server.completion;
}
