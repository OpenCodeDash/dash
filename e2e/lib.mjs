// Shared test helpers: a tiny result collector plus opencode-server API helpers
// used to spin up / clean up scratch sessions deterministically.
export const API_URL = process.env.API_URL || "http://localhost:4096";
export const APP_URL = process.env.APP_URL || "http://localhost:5173";

export class Suite {
	constructor(name) {
		this.name = name;
		this.results = [];
	}
	check(name, cond, detail = "") {
		const pass = !!cond;
		this.results.push({ name, pass, detail });
		console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
	}
	get passed() { return this.results.filter((r) => r.pass).length; }
	get total() { return this.results.length; }
	summary() {
		console.log(`\n=== ${this.name}: ${this.passed}/${this.total} passed ===`);
		this.results.filter((r) => !r.pass).forEach((r) => console.log(`  FAIL: ${r.name}${r.detail ? " — " + r.detail : ""}`));
		return this.passed === this.total;
	}
}

// Create a scratch session via the opencode API. Returns {id, title}.
// (directory is not part of the create payload; the session inherits the global dir.)
export async function newScratchSession(title = "e2e scratch") {
	const res = await fetch(`${API_URL}/session`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ title }),
	});
	if (!res.ok) throw new Error(`POST /session -> ${res.status}`);
	const s = await res.json();
	return s;
}

export async function deleteSession(id) {
	try {
		const res = await fetch(`${API_URL}/session/${id}`, { method: "DELETE" });
		return res.ok;
	} catch {
		return false;
	}
}

// Pick the existing session with the most messages, so content-dependent checks
// (markdown, tool cards) run against a session that actually has content.
export async function pickRichSession() {
	const res = await fetch(`${API_URL}/session`);
	const sessions = await res.json();
	let best = null;
	let bestCount = -1;
	for (const s of sessions) {
		try {
			const m = await (await fetch(`${API_URL}/session/${s.id}/message`)).json();
			const n = Array.isArray(m) ? m.length : 0;
			if (n > bestCount) { bestCount = n; best = s; }
		} catch {}
	}
	return best || sessions[0] || null;
}
