// Queue / steer checks. Model-backed (they need a session that is actually
// running), so gated behind --with-model. Each sub-check creates a scratch
// session via the API and deletes it after.
//
// Config via env:
//   E2E_MODEL_WORK  working model id (default local-big/qwen3.8-27b)
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, newScratchSession, deleteSession } from "./lib.mjs";

const WORK = process.env.E2E_MODEL_WORK || "local-big/qwen3.8-27b";

async function pickOption(c, title, id) {
	const opened = await c.eval(`(() => { const b=document.querySelector('button[title=' + JSON.stringify(title) + ']'); if(!b) return false; b.click(); return true; })()`);
	if (!opened) return false;
	await sleep(150);
	return await c.eval(`(() => { const o=document.querySelector('[data-value=' + JSON.stringify(id) + ']'); if(!o) return false; o.click(); return true; })()`);
}

const sendPrompt = (text) => `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input',{bubbles:true})); ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})); return 'submitted' })()`;

const typeText = (text) => `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input',{bubbles:true})); return true })()`;

const clickButton = (label) => `(() => { const b=Array.from(document.querySelectorAll('button')).find(x=>x.innerText.trim()===${JSON.stringify(label)}); if(!b) return false; b.click(); return true })()`;

// Presence probe for a button label (no click).
const hasButton = (label) => `!!Array.from(document.querySelectorAll('button')).find(x=>x.innerText.trim()===${JSON.stringify(label)})`;

const isBusy = `!!document.querySelector('.btn-danger')`;
const queuedCount = `(() => { const m=/queued \\((\\d+)\\)/i.exec(document.body.innerText); return m?Number(m[1]):0 })()`;

async function openSession(c, id) {
	await c.send("Page.navigate", { url: `${APP_URL}/session/${id}` });
	await sleep(3500);
}

async function waitBusy(c) {
	for (let i = 0; i < 30; i++) {
		await sleep(500);
		if (await c.eval(isBusy)) return true;
	}
	return false;
}

async function queueAndSteer(c, s) {
	results("queue/steer: queue, remove, flush and steer");
	const sid = (await newScratchSession("e2e queue")).id;
	try {
		await openSession(c, sid);
		await pickOption(c, "Model", WORK);
		// A long response keeps the session busy while we exercise the queue.
		await c.eval(sendPrompt("Write the integers from 1 to 300, one per line, with no other text."));
		const busy = await waitBusy(c);
		s.check("session becomes busy after send", busy);

		s.check("Queue button shown while busy", await c.eval(hasButton("Queue")));
		s.check("Steer button shown while busy", await c.eval(hasButton("Steer")));

		await c.eval(typeText("queued-alpha"));
		await sleep(150);
		s.check("Queue click accepted", await c.eval(clickButton("Queue")));
		await sleep(200);
		await c.eval(typeText("queued-beta"));
		await sleep(150);
		await c.eval(clickButton("Queue"));
		await sleep(200);
		s.check("two queued messages listed", (await c.eval(queuedCount)) === 2, `count=${await c.eval(queuedCount)}`);

		const removed = await c.eval(`(() => { const xs=[...document.querySelectorAll('[aria-label="Remove queued message"]')]; if(xs.length<2) return false; xs[1].click(); return true; })()`);
		await sleep(200);
		s.check("removing drops one queued message", removed && (await c.eval(queuedCount)) === 1);

		// Steer bypasses the queue: it is sent now, not appended to the list.
		await c.eval(typeText("steer-probe"));
		await sleep(150);
		s.check("Steer click accepted", await c.eval(clickButton("Steer")));
		await sleep(300);
		s.check("steer does not join the queue", (await c.eval(queuedCount)) === 1, `count=${await c.eval(queuedCount)}`);

		// Steering a turn extends the run, and the queued message only flushes
		// once the session settles. Wait for idle *and* an empty queue.
		let drained = false;
		for (let i = 0; i < 240; i++) {
			await sleep(500);
			if (!(await c.eval(isBusy)) && (await c.eval(queuedCount)) === 0) {
				drained = true;
				break;
			}
		}
		s.check("queue drained once idle", drained);
		const body = await c.eval("document.body.innerText");
		s.check("queued message delivered to transcript", body.includes("queued-alpha"));
		s.check("steer message delivered to transcript", body.includes("steer-probe"));
	} finally {
		await deleteSession(sid);
	}
}

export async function run() {
	const s = new Suite("queue");
	const c = await newPage("about:blank");
	try {
		await queueAndSteer(c, s);
	} finally {
		await c.close();
	}
	return s.summary();
}
