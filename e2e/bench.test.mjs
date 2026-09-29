// Performance benchmarks: first render, SSE connect, session switch, modal open.
// Informational — does not fail the suite; prints timings.
import { newPage, sleep, results } from "./cdp.mjs";
import { APP_URL, API_URL } from "./lib.mjs";

export async function run() {
	const p = await newPage("about:blank");
	await p.send("Runtime.enable");
	await p.send("Page.enable");
	await p.send("Network.enable");
	const net = { first: null, eventReq: null, eventResp: null };
	p.on("Network.requestWillBeSent", (params) => {
		const u = (params.request && params.request.url) || "";
		if (net.first == null) net.first = params.timestamp;
		if (u.includes("/event") && net.eventReq == null) net.eventReq = params.timestamp;
	});
	p.on("Network.responseReceived", (params) => {
		const u = (params.request && params.request.url) || "";
		if (u.includes("/event") && net.eventReq != null && net.eventResp == null) net.eventResp = params.timestamp;
	});

	const tNav0 = Date.now();
	await p.send("Page.navigate", { url: APP_URL + "/" });
	let appReadyMs = null;
	for (let i = 0; i < 80; i++) {
		await sleep(100);
		const n = await p.eval('document.querySelectorAll("span[title=\\"Double-click to rename\\"]").length');
		if (n > 0) { appReadyMs = Date.now() - tNav0; break; }
	}
	const navTiming = await p.eval(`(() => { const e = performance.getEntriesByType('navigation')[0]; return e ? { dcl: Math.round(e.domContentLoadedEventEnd), load: Math.round(e.loadEventEnd) } : null })()`);
	await sleep(1500);

	results("Benchmarks");
	console.log("  timeToFirstSessionItem(ms):", appReadyMs);
	console.log("  navigation timing(ms):", JSON.stringify(navTiming));
	if (net.eventReq != null) console.log("  SSE /event (ms after first req):", net.eventResp != null ? Math.round((net.eventResp - net.first) * 1000) + " [resp]" : Math.round((net.eventReq - net.first) * 1000) + " [stream open]");

	// session switch timing (cycle through existing sessions)
	const sessions = await (await fetch(`${API_URL}/session`)).json();
	// map id -> title by reading the sidebar after load
	const targets = sessions.slice(0, 3).map((s) => s.title).filter(Boolean);
	results("Session switch (click -> URL change)");
	for (let i = 0; i < targets.length; i++) {
		const title = targets[i];
		const r = await p.eval(`new Promise((resolve) => {
	  const title = ${JSON.stringify(title)};
	  const spans = Array.from(document.querySelectorAll('span[title="Double-click to rename"]'));
	  const el = spans.find(s => s.textContent.trim() === title);
	  if (!el) return resolve({err:'not found', title});
	  const urlBefore = location.pathname; const t0 = performance.now(); el.click();
	  const iv = setInterval(() => { if (location.pathname !== urlBefore) { clearInterval(iv); resolve({ ms: Math.round(performance.now()-t0) }); } }, 16);
	  setTimeout(() => { clearInterval(iv); resolve({ ms: Math.round(performance.now()-t0), timeout:true }); }, 8000);
	})`, { awaitPromise: true });
		console.log("  ->", title, ":", JSON.stringify(r));
		await sleep(400);
	}

	results("Modal open (New session -> .modal-backdrop)");
	for (let i = 0; i < 3; i++) {
		const r = await p.eval(`new Promise((resolve) => {
	  const btn = document.querySelector('button[title="New session"]'); if (!btn) return resolve({err:'no btn'});
	  const t0 = performance.now(); btn.click();
	  const iv = setInterval(() => { if (document.querySelector('.modal-backdrop')) { clearInterval(iv); resolve({ ms: Math.round(performance.now()-t0) }); } }, 8);
	  setTimeout(() => { clearInterval(iv); resolve({ ms: Math.round(performance.now()-t0), timeout:true }); }, 4000);
	})`, { awaitPromise: true });
		console.log("  open:", JSON.stringify(r));
		await p.eval(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); const x=document.querySelector('.modal-dialog .icon-btn'); if(x) x.click(); return true })()`);
		await sleep(500);
	}

	await p.close();
	return true; // benchmarks never fail the suite
}
