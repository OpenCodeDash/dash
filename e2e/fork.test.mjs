// Fork + revert from a message. Model-backed (each prompt drives a live model),
// so it runs under --with-model. Creates its own scratch session, forks it, then
// reverts/restores it, and cleans everything up.
//
// Config via env:
//   E2E_MODEL_WORK  model id for the scratch prompts (default opencode/big-pickle)
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, newScratchSession, deleteSession, authenticate } from "./lib.mjs";

const WORK = process.env.E2E_MODEL_WORK || "opencode/big-pickle";

async function pickOption(c, title, id) {
	const opened = await c.eval(`(() => { const b=document.querySelector(${JSON.stringify(`button[title="${title}"]`)}); if(!b) return false; b.click(); return true; })()`);
	if (!opened) return false;
	await sleep(150);
	return await c.eval(`(() => { const o=document.querySelector(${JSON.stringify(`[data-value="${id}"]`)}); if(!o) return false; o.click(); return true; })()`);
}

const sendPrompt = (text) => `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input',{bubbles:true})); ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})); return 'submitted' })()`;

const clickByText = (text, root = "document") => `(() => { const b=[...${root}.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(text)}); if(!b) return false; b.click(); return true; })()`;

async function openSession(c, id) {
	await c.send("Page.navigate", { url: `${APP_URL}/session/${id}` });
	await sleep(3000);
}

// Send a prompt and wait until the assistant turn finishes (Stop button gone and
// at least one rendered reply present).
async function promptAndWait(c, text, existingReplies) {
	await c.eval(sendPrompt(text));
	for (let i = 0; i < 60; i++) {
		await sleep(1000);
		const st = await c.eval(`(() => ({ busy: !!document.querySelector('.btn-danger'), replies: document.querySelectorAll('.md').length }))()`);
		if (!st.busy && st.replies > existingReplies) return true;
	}
	return false;
}

async function countForks(c) {
	return await c.eval(`[...document.querySelectorAll('button')].filter(b => (b.textContent||'').trim() === 'Fork').length`);
}

export async function run() {
	const s = new Suite("fork");
	const token = await authenticate();
	const c = await newPage("about:blank", { token });
	const sid = (await newScratchSession("e2e fork revert")).id;
	let forkedId = null;
	try {
		await openSession(c, sid);
		await pickOption(c, "Model", WORK);

		const first = await promptAndWait(c, "Reply with exactly one word: apple", 0);
		const second = first && (await promptAndWait(c, "Reply with exactly one word: banana", 1));
		s.check("scratch session produced two exchanges", first && second);
		if (!first || !second) return s.summary();
		s.check("original shows a Fork action per user message", (await countForks(c)) === 2, `forks=${await countForks(c)}`);

		// --- Fork from the second user message ---
		results("fork: new session from a message");
		const clickedFork = await c.eval(`(() => { const btns=[...document.querySelectorAll('button')].filter(b => (b.textContent||'').trim() === 'Fork'); btns[btns.length-1]?.click(); return btns.length; })()`);
		let forked = false;
		for (let i = 0; i < 20; i++) {
			await sleep(500);
			const href = await c.eval("location.href");
			const m = href.match(/session\/(ses_\w+)/);
			if (m && m[1] !== sid) { forkedId = m[1]; forked = true; break; }
		}
		s.check("fork navigates to a new session", clickedFork === 2 && forked, `href=${await c.eval("location.href")}`);
		if (forked) {
			await sleep(2500);
			const forkedForks = await countForks(c);
			s.check("forked session contains the earlier exchange only", forkedForks === 1, `forks=${forkedForks}`);
			s.check("fork appears in the sidebar", await c.eval(`([...document.querySelectorAll('aside *')].some(e => /fork #1/.test(e.textContent||'')))`));
			const forkedTitle = await c.eval(`(() => { const el=[...document.querySelectorAll('aside span')].find(e=>/fork #1/.test(e.textContent||'')); return el?el.textContent:null; })()`);
			s.check("fork is titled with the (fork #1) suffix", typeof forkedTitle === "string" && /fork #1/.test(forkedTitle), JSON.stringify(forkedTitle));
		}

		// --- Revert to the second user message (on the original) ---
		results("revert: roll back + restore");
		await openSession(c, sid);
		const clickedRevert = await c.eval(`(() => { const btns=[...document.querySelectorAll('button')].filter(b => (b.textContent||'').trim() === 'Revert'); btns[btns.length-1]?.click(); return btns.length; })()`);
		await sleep(400);
		const dialog = await c.eval(`(() => { const d=document.querySelector('[role="dialog"]'); return d ? (d.querySelector('.modal-title')?.textContent||'') : null; })()`);
		s.check("revert asks for confirmation", clickedRevert === 2 && dialog === "Revert to this message", JSON.stringify(dialog));
		await c.eval(`(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Revert'); b?.click(); return !!b; })()`);
		let dock = "";
		for (let i = 0; i < 20; i++) {
			await sleep(500);
			dock = await c.eval(`(() => { const d=document.querySelector('[class*="revertDock"]'); return d ? d.textContent : ""; })()`);
			if (/rolled back/.test(dock)) break;
		}
		s.check("revert dock summarizes rolled-back messages", /2 rolled back messages/.test(dock), JSON.stringify(dock));
		const dimmed = await c.eval(`document.querySelectorAll('[class*="reverted"]').length`);
		s.check("rolled-back messages are dimmed", dimmed === 2, `dimmed=${dimmed}`);
		const composerText = await c.eval(`document.querySelector('textarea')?.value ?? null`);
		s.check(
			"revert prefills the composer with the reverted message text",
			composerText === "Reply with exactly one word: banana",
			JSON.stringify(composerText),
		);

		// Revert must survive a reload (it is persisted on the session).
		await openSession(c, sid);
		await sleep(1500);
		const dockAfterReload = await c.eval(`(() => { const d=document.querySelector('[class*="revertDock"]'); return d ? d.textContent : ""; })()`);
		s.check("revert persists across reload", /rolled back/.test(dockAfterReload), JSON.stringify(dockAfterReload));

		// Restore clears the revert and the dock.
		await c.eval(clickByText("Restore"));
		let restored = false;
		for (let i = 0; i < 20; i++) {
			await sleep(500);
			const hasDock = await c.eval(`!!document.querySelector('[class*="revertDock"]')`);
			if (!hasDock) { restored = true; break; }
		}
		const dimAfter = await c.eval(`document.querySelectorAll('[class*="reverted"]').length`);
		s.check("restore clears the revert dock", restored);
		s.check("restore un-dims the messages", dimAfter === 0, `dimmed=${dimAfter}`);
	} finally {
		if (forkedId) await deleteSession(forkedId);
		await deleteSession(sid);
		await c.close();
	}
	return s.summary();
}
