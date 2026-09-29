// Reusable CDP (Chrome DevTools Protocol) harness over Node 24 built-in fetch + WebSocket.
// No external deps. Configurable via env:
//   CDP_HOST / CDP_PORT  (default 127.0.0.1:9222)
//   APP_URL              (default http://localhost:5173) — Vite dev server
//   SHOT_DIR             (default <this file>/shots)
export const CDP = `${process.env.CDP_HOST || "127.0.0.1"}:${process.env.CDP_PORT || "9222"}`;
export const APP_URL = process.env.APP_URL || "http://localhost:5173";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || join(__dirname, "shots");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Client {
	constructor(wsUrl) {
		this.ws = new WebSocket(wsUrl);
		this.id = 0;
		this.pending = new Map();
		this.handlers = new Map();
		this.ready = new Promise((r, j) => {
			this.ws.onopen = () => r();
			this.ws.onerror = (e) => j(new Error("ws open failed " + (e?.message || "")));
		});
		this.ws.onmessage = (m) => {
			const msg = JSON.parse(m.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			} else if (msg.method) {
				(this.handlers.get(msg.method) || []).forEach((h) => h(msg.params));
			}
		};
	}
	on(ev, h) { (this.handlers.has(ev) ? this.handlers.get(ev) : this.handlers.set(ev, []).get(ev)).push(h); }
	off(ev, h) { const arr = this.handlers.get(ev); if (arr) this.handlers.set(ev, arr.filter((x) => x !== h)); }
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
			setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("timeout " + method)); } }, 20000);
		});
	}
	// Note: pass awaitPromise:true for any expression that is (or returns) a Promise.
	async eval(expression, { returnByValue = true, awaitPromise = false } = {}) {
		const r = await this.send("Runtime.evaluate", { expression, returnByValue, awaitPromise });
		if (r.exceptionDetails) throw new Error("eval exception: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
		return r.result?.value;
	}
	async shot(name) {
		try {
			const { data } = await this.send("Page.captureScreenshot", { format: "png" });
			mkdirSync(SHOT_DIR, { recursive: true });
			const p = join(SHOT_DIR, `${name}.png`);
			writeFileSync(p, Buffer.from(data, "base64"));
			return p;
		} catch {
			return null; // screenshots are best-effort; never fail a test on them
		}
	}
	async close() {
		try { if (this.targetId) await fetch(`http://${CDP}/json/close/${this.targetId}`).catch(() => {}); } catch {}
		try { this.ws.close(); } catch {}
	}
}

export async function newPage(url) {
	let res = await fetch(`http://${CDP}/json/new?url=${encodeURIComponent(url)}`, { method: "PUT" });
	if (!res.ok) res = await fetch(`http://${CDP}/json/new?url=${encodeURIComponent(url)}`);
	const t = await res.json();
	const c = new Client(t.webSocketDebuggerUrl);
	c.targetId = t.id;
	await c.ready;
	await c.send("Runtime.enable");
	await c.send("Page.enable");
	await c.send("DOM.enable");
	await c.send("Log.enable");
	await c.send("Network.enable");
	if (url) {
		await c.send("Page.navigate", { url });
		await new Promise((r) => {
			let done = false;
			const h = (p) => { if (p?.loaderId) { done = true; c.off("Page.loadEventFired", h); r(); } };
			c.on("Page.loadEventFired", h);
			setTimeout(() => { if (!done) r(); }, 8000);
		});
	}
	return c;
}

// React-safe click
export const clickSel = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { ok:false, err:"not found" };
  el.scrollIntoView({ block:"center" });
  el.click();
  return { ok:true, tag: el.tagName, text: (el.textContent||"").slice(0,40) };
})()`;

// React-safe text entry (controlled inputs)
export const typeSel = (sel, text) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { ok:false, err:"not found" };
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, ${JSON.stringify(text)});
  el.dispatchEvent(new Event("input", { bubbles:true }));
  el.dispatchEvent(new Event("change", { bubbles:true }));
  return { ok:true, val: el.value };
})()`;

export const exists = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;
export const textOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`;

export async function waitFor(c, sel, timeout = 5000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await c.eval(exists(sel))) return true;
		await sleep(120);
	}
	return false;
}

export function results(name) { console.log(`\n=== ${name} ===`); }
