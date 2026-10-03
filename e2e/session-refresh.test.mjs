// Session transcript auto-refresh on resume (task #31).
//
// The transcript (useMessageWindow) loads the newest chunk once on mount. Newer
// messages arrive live while the page is open via the event stream, but if the
// browser is suspended (laptop closed / app backgrounded) and then resumed, the
// transcript must refetch the newest chunk to catch up. This suite proves that
// wiring deterministically, WITHOUT a model:
//   1. open a session (one that has messages when available),
//   2. install a window.fetch wrapper that counts calls to the /message endpoint,
//   3. record the count once the initial load has settled (baseline),
//   4. fire a "resume" exactly the way the implementation listens for it
//      (visibilitychange + focus),
//   5. assert a NEW /message fetch occurred — no full page reload, no model,
//   6. assert a rapid second resume is throttled (no extra fetch).
//
// A full prompt-while-away -> resume -> new-message scenario is not exercised
// here because it needs a live model and is inherently non-deterministic; the
// network-level "refetch on resume" assertion above is the sufficient, reliable
// feature verification (the merge is already covered by the store's idempotent
// setMessages, which the initial load and loadOlder both rely on).
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, API_URL, APP_URL, pickRichSession, newScratchSession, deleteSession, authenticate } from "./lib.mjs";

// Wraps window.fetch and counts calls whose URL targets the /message endpoint,
// leaving the request/response untouched. Idempotent: installs once per page.
const installFetcherCounter = `(() => {
  if (window.__msgFetch) return { installed: true, count: window.__msgFetch.count };
  const orig = window.fetch;
  const counter = { count: 0 };
  window.fetch = (input, init) => {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.includes("/message")) counter.count++;
    } catch (e) {}
    return orig.apply(this, arguments);
  };
  window.__msgFetch = counter;
  return { installed: true, count: counter.count };
})()`;

const readCount = `(() => (window.__msgFetch ? window.__msgFetch.count : -1))()`;

// Resolves once the transcript has settled: either content rendered (.md) or the
// loaded empty-state is showing. This is what "initial load finished" means in the DOM.
async function waitTranscriptSettled(c, timeout = 9000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const st = await c.eval(`(() => {
			const hasContent = !!document.querySelector(".md");
			const emptyLoaded = /Send a message to start the conversation\\./.test(document.body.innerText);
			return hasContent || emptyLoaded;
		})()`);
		if (st) return true;
		await sleep(200);
	}
	return false;
}

export async function run() {
	const s = new Suite("session-refresh");
	const token = await authenticate();
	const c = await newPage("about:blank", { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.text || ""));
	let createdScratch = null;

	try {
		// Prefer a session that actually has messages so the resume refetch merges
		// real content. Fall back to a fresh scratch session — the refetch-on-resume
		// mechanism is identical for an empty session (it still issues the fetch).
		let target = await pickRichSession();
		let msgCount = 0;
		if (target) {
			try {
				const m = await (await fetch(`${API_URL}/session/${target.id}/message`)).json();
				msgCount = Array.isArray(m) ? m.length : 0;
			} catch {}
		}
		if (!target || msgCount === 0) {
			target = await newScratchSession("e2e session refresh");
			createdScratch = target.id;
			msgCount = 0;
		}

		results("session-refresh: resume triggers a message refetch");
		await c.send("Page.navigate", { url: `${APP_URL}/session/${target.id}` });
		await sleep(1200);
		const settled = await waitTranscriptSettled(c);
		s.check("initial load settled", settled, `session=${target.id} msgs=${msgCount}`);
		if (!settled) {
			s.check("transcript rendered (content or empty-state)", false, "no transcript within timeout");
			s.check("no uncaught exceptions during session-refresh suite", exc.length === 0, exc.slice(0, 3).join(" | "));
			return s.summary();
		}
		await sleep(600); // let any in-flight initial-load requests finish

		// Install the fetch counter now that the initial load is complete.
		const inst = await c.eval(installFetcherCounter);
		s.check("fetch counter installed", inst && inst.installed, JSON.stringify(inst));
		const baseline = await c.eval(readCount);
		s.check("baseline recorded after initial load", typeof baseline === "number" && baseline >= 0, `baseline=${baseline}`);

		// Fire a "resume" the exact way the hook listens for it.
		await c.eval(`document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus"));`);
		await sleep(2500); // allow the (throttled) refetch to complete
		const after = await c.eval(readCount);
		s.check("resume triggered a NEW /message fetch (auto-refresh wired, no reload)", after > baseline, `baseline=${baseline} -> after=${after}`);

		// A rapid second resume (within the throttle window) must not refetch again.
		await c.eval(`window.dispatchEvent(new Event("focus"));`);
		await sleep(700);
		const afterSecond = await c.eval(readCount);
		s.check("rapid second resume is throttled (no extra fetch)", afterSecond === after, `after=${after} -> afterSecond=${afterSecond}`);

		s.check("no uncaught exceptions during session-refresh suite", exc.length === 0, exc.slice(0, 3).join(" | "));
	} finally {
		if (createdScratch) await deleteSession(createdScratch);
		await c.close();
	}
	return s.summary();
}
