// Subagent drill-in checks: the `task` tool card, sidebar nesting, and the
// read-only child view with a breadcrumb back to the parent.
//
// These depend on the server actually having a parent session that spawned a
// subagent (a `task` tool part with state.metadata.sessionId). pickParentChild()
// finds that pair; when none exists the suite skips vacuously rather than
// failing, so it stays robust across server states (no model needed).
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, pickParentChild, authenticate } from "./lib.mjs";

const clickFirst = (sel) => `(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`;

// The transcript is virtualized and history is loaded in chunks, so an older
// subagent card is only in the DOM once it has been loaded and scrolled into
// range. Jump to the top of the list (which triggers the next older chunk) and
// poll until the selector appears.
async function scrollUpToFind(c, sel, maxRounds = 40) {
	for (let i = 0; i < maxRounds; i++) {
		if (await c.eval(`!!document.querySelector(${JSON.stringify(sel)})`)) return true;
		const ok = await c.eval(`(() => { const el=document.querySelector('[data-virtuoso-scroller]'); if(!el) return false; el.scrollTop = 0; return true; })()`);
		if (!ok) return false;
		await sleep(700);
	}
	return false;
}

export async function run() {
	const s = new Suite("subagent");
	const pair = await pickParentChild();
	if (!pair) {
		console.log("\n=== subagent: skipped (no parent session with a subagent on server) ===");
		return true;
	}
	const { parent, child } = pair;
	const token = await authenticate();
	const c = await newPage("about:blank", { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.text || ""));

	try {
		// 1. Sidebar: children nested under their parent
		results("1. Sidebar nesting");
		await c.send("Page.navigate", { url: APP_URL + "/" });
		await sleep(3000);
		const branches = await c.eval(`document.querySelectorAll('span[title="Subagent"]').length`);
		s.check("sidebar nests children under parent (↳ branch markers)", branches > 0, `${branches} nested items`);

		// 2. Subagent cards rendered in the parent transcript
		results("2. Subagent cards");
		await c.send("Page.navigate", { url: `${APP_URL}/session/${parent.id}` });
		await sleep(3000);
		await scrollUpToFind(c, 'button[title="View subagent session"]');
		const cards = await c.eval(`document.querySelectorAll('button[title="View subagent session"]').length`);
		s.check("subagent cards rendered in parent", cards > 0, `${cards} cards`);
		const typeChip = await c.eval(`(() => { const b=document.querySelector('button[title="View subagent session"]'); return b ? [...b.querySelectorAll('span')].some(x=>/explore|code-reviewer|general|test-writer/i.test(x.textContent||'')) : false })()`);
		s.check("subagent card shows subagent-type chip", typeChip);
		const cardText = await c.eval(`(() => { const b=document.querySelector('button[title="View subagent session"]'); return b ? (b.textContent||'').trim() : null })()`);
		s.check("subagent card shows a description label", !!cardText && cardText.length > 9, JSON.stringify(cardText));

		// 3. Drill-in: click a card -> child session, breadcrumb, read-only
		results("3. Drill-in + breadcrumb + read-only");
		const clicked = await c.eval(clickFirst(`button[title="View subagent session"]`));
		await sleep(3000);
		const url = await c.eval("location.href");
		s.check("clicking a card navigates to a child session (not parent)", clicked && /\/session\/ses_/.test(url) && !url.includes(parent.id), url);
		s.check("child page shows 'subagent' breadcrumb chip", await c.eval(`!!document.querySelector('.chip-subagent')`));
		const backHref = await c.eval(`(() => { const a=[...document.querySelectorAll('a')].find(x=>/←/.test(x.textContent||'')); return a ? a.getAttribute('href') : null })()`);
		s.check("breadcrumb links back to the parent session", backHref === `/session/${parent.id}`, String(backHref));
		s.check("child page is read-only (composer hidden)", (await c.eval(`!!document.querySelector('textarea')`)) === false);

		// 4. Breadcrumb navigates back to the parent
		results("4. Back to parent");
		await c.eval(`(() => { const a=[...document.querySelectorAll('a')].find(x=>/←/.test(x.textContent||'')); a?.click(); return !!a })()`);
		await sleep(3000);
		const backUrl = await c.eval("location.href");
		s.check("breadcrumb navigates back to parent", backUrl.includes(parent.id), backUrl);

		s.check("no uncaught exceptions during subagent suite", exc.length === 0, exc.slice(0, 3).join(" | "));
	} finally {
		await c.close();
	}
	return s.summary();
}
