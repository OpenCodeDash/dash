// Model-backed checks: real streaming, error-state rendering, permission and
// question prompts. Slow (each drives a live model). Gated behind --with-model.
// Each sub-check creates a scratch session via the API and deletes it after.
//
// Config via env:
//   E2E_MODEL_WORK  working model id   (default local-big/qwen3.8-27b)
//   E2E_MODEL_DOWN  unreachable model  (default local-small/gpt-oss-20b)
//   E2E_AGENT       agent that triggers a bash permission (default code-reviewer)
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, newScratchSession, deleteSession } from "./lib.mjs";

const WORK = process.env.E2E_MODEL_WORK || "local-big/qwen3.8-27b";
const DOWN = process.env.E2E_MODEL_DOWN || "local-small/gpt-oss-20b";
const AGENT = process.env.E2E_AGENT || "code-reviewer";

const setModel = (id) => `(() => { const s=document.querySelector('select[title="Model"]'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change',{bubbles:true})); return s.value })()`;
const setAgent = (id) => `(() => { const s=document.querySelector('select[title="Agent"]'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change',{bubbles:true})); return s.value })()`;
const sendPrompt = (text) => `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input',{bubbles:true})); ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})); return 'submitted' })()`;

async function openSession(c, id) {
	await c.send("Page.navigate", { url: `${APP_URL}/session/${id}` });
	await sleep(3500);
}

async function streaming(c, s) {
	results("model: real token streaming");
	const sid = (await newScratchSession("e2e stream")).id;
	try {
		await openSession(c, sid);
		await c.eval(setModel(WORK));
		await c.eval(sendPrompt("Count 1 to 3, one number per line. Stop after 3."));
		let sawBusy = false, sawCursor = false, grew = 0, prev = 0, sawIdle = false;
		for (let i = 0; i < 40; i++) {
			await sleep(3000);
			const st = await c.eval(`(() => { const mds=[...document.querySelectorAll('.md')]; return { busy:!!document.querySelector('.btn-danger'), cursor:!!document.querySelector('[class*="cursor"]'), lastLen: mds.length?mds[mds.length-1].innerText.length:0 } })()`);
			if (st.busy) sawBusy = true;
			if (st.cursor) sawCursor = true;
			if (st.lastLen > prev && prev > 0) grew++;
			prev = st.lastLen;
			if (!st.busy && i > 3) { sawIdle = true; break; }
		}
		const finalText = await c.eval(`(() => { const mds=[...document.querySelectorAll('.md')]; return mds.length?mds[mds.length-1].innerText.slice(0,120):'' })()`);
		s.check("saw busy (Stop) indicator", sawBusy);
		s.check("saw streaming cursor", sawCursor);
		s.check("assistant output grew across polls", grew > 0, `growthSteps=${grew}`);
		s.check("reached idle", sawIdle);
		s.check("assistant produced non-empty text", (finalText || "").trim().length > 0, JSON.stringify(finalText));
	} finally {
		await deleteSession(sid);
	}
}

async function errorState(c, s) {
	results("model: error-state rendering (down backend)");
	const sid = (await newScratchSession("e2e error")).id;
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.text || ""));
	try {
		await openSession(c, sid);
		await c.eval(setModel(DOWN));
		await c.eval(sendPrompt("hi"));
		let rendered = false;
		for (let i = 0; i < 30; i++) {
			await sleep(3000);
			const st = await c.eval(`(() => { const t=document.body.innerText; return { busy:!!document.querySelector('.btn-danger'), err:/connect|Unable|timeout|ECONN|500|Something went wrong|Retry:/i.test(t) } })()`);
			if (!st.busy && st.err) { rendered = true; break; }
			if (!st.busy && i > 20) break;
		}
		const stillAlive = await c.eval(`!!document.querySelector('textarea') && !!document.querySelector('select[title="Model"]')`);
		s.check("error message rendered", rendered);
		s.check("app stays interactive after error", stillAlive);
		s.check("no uncaught exceptions on error", exc.length === 0, exc.slice(0, 2).join(" | "));
	} finally {
		c.off("Runtime.exceptionThrown");
		await deleteSession(sid);
	}
}

async function permission(c, s) {
	results("model: permission prompt (allow once)");
	const sid = (await newScratchSession("e2e perm")).id;
	try {
		await openSession(c, sid);
		await c.eval(setAgent(AGENT));
		await c.eval(setModel(WORK));
		await c.eval(sendPrompt('Run a bash command: execute "ls -la" to list files in the current directory, then tell me how many there are.'));
		let shown = false;
		for (let i = 0; i < 40; i++) {
			await sleep(3000);
			shown = await c.eval(`!!Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Allow once')`);
			if (shown) break;
		}
		s.check("permission prompt appeared", shown);
		if (shown) {
			await c.eval(`(() => { const b=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Allow once'); b?.click(); return !!b })()`);
			await sleep(6000);
			const gone = await c.eval(`!Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Allow once')`);
			s.check("'Allow once' consumed the prompt", gone);
		}
	} finally {
		await deleteSession(sid);
	}
}

async function question(c, s) {
	results("model: question prompt (option + submit)");
	const sid = (await newScratchSession("e2e question")).id;
	try {
		await openSession(c, sid);
		await c.eval(setModel(WORK));
		await c.eval(sendPrompt('Use the question tool now to ask me a single multiple-choice question: "Which deployment target should I use?" with exactly three options: Staging, Production, and Both. Do not answer it yourself.'));
		let shown = false;
		for (let i = 0; i < 40; i++) {
			await sleep(3000);
			shown = await c.eval(`(function(){ const opts=Array.from(document.querySelectorAll('button')).map(b=>b.innerText.trim()).filter(t=>['Staging','Production','Both'].includes(t)).length; return opts>0 && !!Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Submit') })()`);
			if (shown) break;
		}
		s.check("question prompt appeared", shown);
		if (shown) {
			await c.eval(`(() => { const b=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Production'); b?.click(); return !!b })()`);
			await sleep(400);
			await c.eval(`(() => { const b=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Submit'); b?.click(); return !!b })()`);
			await sleep(5000);
			const gone = await c.eval(`!Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Submit')`);
			s.check("Submit consumed the question", gone);
		}
	} finally {
		await deleteSession(sid);
	}
}

export async function run() {
	const s = new Suite("model");
	const c = await newPage("about:blank");
	try {
		await streaming(c, s);
		await errorState(c, s);
		await permission(c, s);
		await question(c, s);
	} finally {
		await c.close();
	}
	return s.summary();
}
