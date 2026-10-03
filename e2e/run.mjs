// Orchestrator for the headless e2e suite.
//
//   node e2e/run.mjs            structural + lifecycle + subagent + session-refresh + bench + boards + tasks + mobile-swipe
//   node e2e/run.mjs --with-model   also run model-backed checks (needs a working model)
//
// Prereqs (see README.md): opencode server on :4096, Vite dev server on :5173,
// and a headless Chromium with CDP on :9222. The boards suite additionally needs
// the backdash server on :3000 (it is skipped when backdash is unreachable).
import { CDP } from "./cdp.mjs";
import { API_URL, BOARD_URL } from "./lib.mjs";
import { run as runStructural } from "./structural.test.mjs";
import { run as runLifecycle } from "./lifecycle.test.mjs";
import { run as runSubagent } from "./subagent.test.mjs";
import { run as runSessionRefresh } from "./session-refresh.test.mjs";
import { run as runBench } from "./bench.test.mjs";
import { run as runBoards } from "./boards.test.mjs";
import { run as runTasks } from "./tasks.test.mjs";
import { run as runMobileSwipe } from "./mobile-swipe.test.mjs";
import { run as runModel } from "./model.test.mjs";

const withModel = process.argv.includes("--with-model");

async function reachable(url) {
	try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; }
}

const cdpOk = await reachable(`http://${CDP}/json`);
const apiOk = await reachable(`${API_URL}/session`);
const boardsOk = await reachable(`${BOARD_URL}/kanban`);
if (!cdpOk || !apiOk) {
	console.error("Prerequisites not met:");
	if (!cdpOk) console.error(`  - CDP not reachable at http://${CDP}/json (start headless Chromium, see README.md)`);
	if (!apiOk) console.error(`  - opencode API not reachable at ${API_URL} (start: opencode serve)`);
	process.exit(2);
}

// A crashing suite must not abort the run: record it as a failure and continue.
async function runSuite(name, fn) {
	try {
		return await fn();
	} catch (err) {
		console.error(`\n=== ${name}: CRASHED — ${err?.message || err} ===`);
		return false;
	}
}

const failures = [];
if (!(await runSuite("structural", runStructural))) failures.push("structural");
if (!(await runSuite("lifecycle", runLifecycle))) failures.push("lifecycle");
if (!(await runSuite("subagent", runSubagent))) failures.push("subagent");
if (!(await runSuite("session-refresh", runSessionRefresh))) failures.push("session-refresh");
await runBench();
if (boardsOk) {
	if (!(await runSuite("boards", runBoards))) failures.push("boards");
	if (!(await runSuite("tasks", runTasks))) failures.push("tasks");
	if (!(await runSuite("mobile-swipe", runMobileSwipe))) failures.push("mobile-swipe");
} else {
	console.log("\n(skip boards checks — backdash server not reachable at " + BOARD_URL + ")");
}
if (withModel) {
	if (!(await runSuite("model", runModel))) failures.push("model");
} else {
	console.log("\n(skip model-backed checks — pass --with-model to include)");
}

console.log(`\n${failures.length ? "RESULT: FAILED -> " + failures.join(", ") : "RESULT: all suites passed"}`);
process.exit(failures.length ? 1 : 0);
