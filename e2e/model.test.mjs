// Model-backed checks: real streaming, error-state rendering, permission and
// question prompts. Slow (each drives a live model). Gated behind --with-model.
// Each sub-check creates a scratch session via the API and deletes it after.
//
// Config via env:
//   E2E_MODEL_WORK  working model id   (default local-big/qwen3.8-27b)
//   E2E_MODEL_DOWN  unreachable model  (default local-small/gpt-oss-20b)
//   E2E_AGENT       agent that triggers a bash permission (default code-reviewer)
import { newPage, sleep, results, wheel } from "./cdp.mjs";
import { Suite, APP_URL, newScratchSession, deleteSession } from "./lib.mjs";

const WORK = process.env.E2E_MODEL_WORK || "local-big/qwen3.8-27b";
const DOWN = process.env.E2E_MODEL_DOWN || "local-small/gpt-oss-20b";
const AGENT = process.env.E2E_AGENT || "code-reviewer";

// Drive the custom dropdown (replaces the old native <select>): open the trigger
// by its title, then click the option whose data-value matches. The listbox
// renders on a separate (async) React pass, so open and pick are two evals with
// a short settle between them.
async function pickOption(c, title, id) {
	const opened = await c.eval(`(() => { const b=document.querySelector(${JSON.stringify(`button[title="${title}"]`)}); if(!b) return false; b.click(); return true; })()`);
	if (!opened) return false;
	await sleep(150);
	return await c.eval(`(() => { const o=document.querySelector(${JSON.stringify(`[data-value="${id}"]`)}); if(!o) return false; o.click(); return true; })()`);
}
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
		await pickOption(c, "Model", WORK);
		// A long-enough response so token streaming spans multiple polls (a tiny
		// reply can complete before the first sample, making "growth" unobservable)
		// and so the transcript overflows the viewport, which is what makes the
		// follow-scroll regression observable.
		await c.eval(sendPrompt("List the first 60 prime numbers, one per line. Start from 2."));
		// Regression for #30: the composer must clear on send, not after the
		// (slow) synchronous prompt resolves.
		await sleep(200);
		const composerEmpty = await c.eval(`document.querySelector('textarea').value === ''`);
		s.check("composer cleared on send", composerEmpty);
		// While streaming the assistant message is NOT a `.md` block (those only
		// render on completion); the in-progress text lives in the `.msg` container
		// that holds the streaming cursor. Measure that container's length to see
		// real token growth across polls.
		// Regression for #113: the view must stay pinned to the bottom while new
		// thinking/messages stream in, not only once the response completes. Track
		// the scroller's distance from the bottom; the buggy build drifts away as
		// the transcript grows.
		let sawBusy = false, sawCursor = false, grew = 0, prev = 0, sawIdle = false;
		let sawOverflow = false, maxFromBottom = 0;
		for (let i = 0; i < 80; i++) {
			await sleep(500);
			const st = await c.eval(`(() => { const cur=document.querySelector('[class*="cursor"]'); let el=cur; while(el && el!==document.body && (el.textContent||'').trim().length<3) el=el.parentElement; const sc=document.querySelector('[data-virtuoso-scroller]'); return { busy:!!document.querySelector('.btn-danger'), cursor:!!cur, len: el?(el.textContent||'').trim().length:0, overflow: sc?sc.scrollHeight>sc.clientHeight+1:false, fromBottom: sc?sc.scrollHeight-sc.scrollTop-sc.clientHeight:0 } })()`);
			if (st.busy) sawBusy = true;
			if (st.cursor) sawCursor = true;
			if (st.len > prev && prev > 0) grew++;
			prev = st.len;
			if (st.overflow) {
				sawOverflow = true;
				if (st.fromBottom > maxFromBottom) maxFromBottom = st.fromBottom;
			}
			if (!st.busy && i > 3) { sawIdle = true; break; }
		}
		const finalText = await c.eval(`(() => { const mds=[...document.querySelectorAll('.md')]; return mds.length?mds[mds.length-1].innerText.slice(0,120):'' })()`);
		s.check("saw busy (Stop) indicator", sawBusy);
		s.check("saw streaming cursor", sawCursor);
		s.check("assistant output grew across polls", grew > 0, `growthSteps=${grew}`);
		s.check("reached idle", sawIdle);
		s.check("assistant produced non-empty text", (finalText || "").trim().length > 0, JSON.stringify(finalText));
		s.check(
			"transcript stayed pinned to the bottom while streaming",
			sawOverflow && maxFromBottom <= 300,
			`maxFromBottom=${maxFromBottom} overflow=${sawOverflow}`,
		);
	} finally {
		await deleteSession(sid);
	}
}

// Regression for #155: while a response streams, an upward scroll must detach the
// view and keep it where the user left it — the growing transcript must not drag
// it back to the bottom. The small nudge (within the near-bottom band) is the case
// that regressed: the old code treated "within N px of the bottom" as following
// and snapped back on the next token.
async function scrollDetach(c, s) {
	results("model: scroll-up detaches while streaming (#155)");
	const sid = (await newScratchSession("e2e scroll detach")).id;
	try {
		await openSession(c, sid);
		await pickOption(c, "Model", WORK);
		await c.eval(
			sendPrompt(
				"List the first 150 prime numbers, one per line, then explain the gap between each consecutive pair in one short sentence.",
			),
		);
		const state = `(() => { const sc=document.querySelector('[data-virtuoso-scroller]'); return { busy:!!document.querySelector('.btn-danger'), overflow: sc?sc.scrollHeight>sc.clientHeight+1:false, fromBottom: sc?Math.round(sc.scrollHeight-sc.scrollTop-sc.clientHeight):0 } })()`;
		// Wait until the transcript overflows and is actively streaming.
		let overflowing = false;
		for (let i = 0; i < 120 && !overflowing; i++) {
			await sleep(500);
			const st = await c.eval(state);
			overflowing = st.overflow && st.busy;
		}
		if (!overflowing) {
			s.check("transcript overflowed while streaming", false);
			return;
		}
		// Let a little more content stream so the transcript is genuinely growing.
		await sleep(1500);
		const pt = await c.eval(
			`(() => { const sc=document.querySelector('[data-virtuoso-scroller]'); if(!sc) return null; const r=sc.getBoundingClientRect(); return { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }; })()`,
		);
		if (!pt) {
			s.check("scroll container present", false);
			return;
		}
		// A small upward nudge: three notches of 8px (24px total) — the gradual
		// trackpad/touch gesture that used to be snapped back to the bottom.
		for (let i = 0; i < 3; i++) {
			await wheel(c, pt.x, pt.y, -8);
			await sleep(60);
		}
		// Keep sampling while the response continues; the view must stay detached.
		let minFromBottom = Infinity;
		let sawBusy = false;
		for (let i = 0; i < 8; i++) {
			await sleep(500);
			const st = await c.eval(state);
			if (st.busy) sawBusy = true;
			if (st.fromBottom < minFromBottom) minFromBottom = st.fromBottom;
		}
		s.check("transcript was streaming during the scroll", sawBusy);
		s.check("scroll-up stayed detached from the bottom", minFromBottom > 30, `minFromBottom=${minFromBottom}`);
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
		await pickOption(c, "Model", DOWN);
		await c.eval(sendPrompt("hi"));
		let rendered = false, cleanReply = false, hung = false;
		for (let i = 0; i < 30; i++) {
			await sleep(3000);
			const st = await c.eval(`(() => { const mds=[...document.querySelectorAll('.md')]; const t=document.body.innerText; return { busy:!!document.querySelector('.btn-danger'), lastLen:mds.length?mds[mds.length-1].innerText.length:0, err:/connect|Unable|timeout|ECONN|500|Something went wrong|Retry:|failed|unavailable|refused|no such model|not found/i.test(t) } })()`);
			if (st.err) { rendered = true; break; }
			if (!st.busy) {
				if (st.lastLen > 0) cleanReply = true; // the "down" model actually answered
				break;
			}
			if (i > 25) hung = true;
		}
		const stillAlive = await c.eval(`!!document.querySelector('textarea') && !!document.querySelector('button[title="Model"]')`);
		if (cleanReply && !rendered) {
			console.log("  (skip error-render check: the 'down' model actually responded — no failing model available to exercise error rendering)");
		} else {
			s.check("error message rendered", rendered, hung ? "model hung (stayed busy, no error text)" : "");
		}
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
		await pickOption(c, "Agent", AGENT);
		await pickOption(c, "Model", WORK);
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
		await pickOption(c, "Model", WORK);
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
		await scrollDetach(c, s);
		await errorState(c, s);
		await permission(c, s);
		await question(c, s);
	} finally {
		await c.close();
	}
	return s.summary();
}
