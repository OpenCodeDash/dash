// Orchestrator for the headless e2e suite.
//
//   node e2e/run.mjs            structural + lifecycle + bench
//   node e2e/run.mjs --with-model   also run model-backed checks (needs a working model)
//
// Prereqs (see README.md): opencode server on :4096, Vite dev server on :5173,
// and a headless Chromium with CDP on :9222.
import { CDP } from "./cdp.mjs";
import { API_URL } from "./lib.mjs";
import { run as runStructural } from "./structural.test.mjs";
import { run as runLifecycle } from "./lifecycle.test.mjs";
import { run as runBench } from "./bench.test.mjs";
import { run as runModel } from "./model.test.mjs";

const withModel = process.argv.includes("--with-model");

async function reachable(url) {
	try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; }
}

const cdpOk = await reachable(`http://${CDP}/json`);
const apiOk = await reachable(`${API_URL}/session`);
if (!cdpOk || !apiOk) {
	console.error("Prerequisites not met:");
	if (!cdpOk) console.error(`  - CDP not reachable at http://${CDP}/json (start headless Chromium, see README.md)`);
	if (!apiOk) console.error(`  - opencode API not reachable at ${API_URL} (start: opencode serve)`);
	process.exit(2);
}

const failures = [];
if (!(await runStructural())) failures.push("structural");
if (!(await runLifecycle())) failures.push("lifecycle");
await runBench();
if (withModel) {
	if (!(await runModel())) failures.push("model");
} else {
	console.log("\n(skip model-backed checks — pass --with-model to include)");
}

console.log(`\n${failures.length ? "RESULT: FAILED -> " + failures.join(", ") : "RESULT: all suites passed"}`);
process.exit(failures.length ? 1 : 0);
