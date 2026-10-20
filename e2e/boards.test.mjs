// Kanban boards integration (dash <-> react-backdash <-> backdash server).
// Full flow in the browser: board create / open / column add / column rename /
// drag-reorder / delete, asserting against both the DOM and the server API.
// Needs the backdash server (default :3000, BOARD_URL env).
import { newPage, sleep, waitFor, typeSel, results } from "./cdp.mjs";
import { Suite, APP_URL, BOARD_URL, authenticate, authFetch } from "./lib.mjs";

const BOARD = "e2e Boards";
const CARDS = `[...document.querySelectorAll('[title="Drag to reorder"]')].map(s=>s.parentElement)`;
const COLS = `[...document.querySelectorAll('[data-column-id]')]`;
const clickByText = (sel, text) =>
	`(() => { const els=[...document.querySelectorAll(${JSON.stringify(sel)})]; const el=els.find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!el) return {ok:false, err:"no button found"}; el.scrollIntoView({block:"center"}); el.click(); return {ok:true}; })()`;

// Boards are seeded with default columns, each with its own (disabled) "Add"
// task button, so "first form button labelled Add" is ambiguous. Submit the
// column form by the input's aria-label instead, which is unique.
const submitColumnForm = () =>
	`(() => { const i=document.querySelector(${JSON.stringify('input[aria-label="New column name"]')}); if(!i) return {ok:false, err:"no input"}; const btn=i.closest("form").querySelector('button[type="submit"]'); if(!btn || btn.disabled) return {ok:false, err:"no submit button"}; btn.click(); return {ok:true}; })()`;

const waitEval = async (page, expr, timeout = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await page.eval(expr)) return true;
		await sleep(120);
	}
	return false;
};

async function deleteBoardsNamed(name) {
	try {
		const list = await authFetch(`${BOARD_URL}/kanban`).then((r) => r.json());
		for (const b of list.filter((x) => x.name === name)) {
			await authFetch(`${BOARD_URL}/kanban/${b.id}`, { method: "DELETE" });
		}
	} catch {}
}

export async function run() {
	const s = new Suite("boards");
	await deleteBoardsNamed(BOARD); // idempotent start: clear leftovers from a failed run

	const token = await authenticate();
	const c = await newPage(`${APP_URL}/boards`, { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "unknown"));
	c.on("Page.javascriptDialogOpening", () => c.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {}));

	try {
		// 1. Boards page renders
		results("1. Boards page");
		s.check("boards page renders", (await waitFor(c, "h1")) && (await c.eval(`document.querySelector("h1")?.textContent`)) === "Boards");

		// 2. Create a board via the UI; the server must have it
		results("2. Create board");
		await c.eval(typeSel('input[placeholder="New board name"]', BOARD));
		s.check("create board clicked", (await c.eval(clickByText("button", "Create"))).ok);
		s.check("board row appears", await waitEval(c, `[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Open")`));
		const list = await authFetch(`${BOARD_URL}/kanban`).then((r) => r.json());
		s.check("server persisted board", list.some((b) => b.name === BOARD), list.length + " board(s)");

		// 3. Open the board
		results("3. Open board");
		await c.eval(clickByText("button", "Open"));
		s.check("navigated to board page", await waitEval(c, `location.pathname.startsWith("/boards/")`));
		s.check("board title shown", await waitEval(c, `document.querySelector("h1")?.textContent === ${JSON.stringify(BOARD)}`));

		// 4. Add two columns via the UI; the server must have them
		results("4. Add columns");
		for (const col of ["First", "Second"]) {
			await c.eval(typeSel('input[aria-label="New column name"]', col));
			await c.eval(submitColumnForm());
		}
		// Columns are applied from the SSE stream; poll instead of assuming a
		// fixed render latency (a slow/laden host can exceed a short sleep).
		await waitEval(
			c,
			`(() => { const t=${CARDS}.map(c=>c.textContent); return t.some(x=>x.includes("First")) && t.some(x=>x.includes("Second")); })()`,
			6000,
		);
		const cols = await c.eval(`${CARDS}.map(c=>c.textContent)`);
		s.check("both columns render", cols.some((t) => t.includes("First")) && cols.some((t) => t.includes("Second")), JSON.stringify(cols.map((x) => x.slice(0, 20))));
		const boardId = await c.eval(`location.pathname.split("/").pop()`);
		const names = await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json()).then((b) => b.columns.map((x) => x.name));
		s.check("server persisted columns", names.includes("First") && names.includes("Second"), names.join(", "));

		// 5. Sidebar lists the board on the home page
		results("5. Sidebar");
		await c.send("Page.navigate", { url: APP_URL + "/" });
		s.check("sidebar lists board", await waitEval(c, `document.querySelector("aside")?.textContent?.includes(${JSON.stringify(BOARD)})`, 6000));
		// The board row is a real link (middle-click / open-in-new-tab, #119); its
		// delete control must be a sibling, not nested inside the anchor.
		const boardLink = await c.eval(`(function(){
  const links=[...document.querySelectorAll('a')].filter(a=>/^\\/boards\\//.test(a.getAttribute('href')||''));
  const match=links.find(a=>(a.textContent||'').includes(${JSON.stringify(BOARD)}));
  const deleteInAnchor=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='✕' && b.closest('a')).length;
  return { total:links.length, matched:!!match, href:match ? match.getAttribute('href') : null, deleteInAnchor };
})()`);
		s.check("board row is a link to /boards/<id>", boardLink.matched && !!boardLink.href, JSON.stringify(boardLink));
		s.check("no delete button nested in a board link", boardLink.deleteInAnchor === 0, JSON.stringify(boardLink));

		// 6. Rename a column via double-click
		results("6. Rename column");
		await c.send("Page.navigate", { url: `${APP_URL}/boards/${boardId}` });
		await waitEval(c, `${COLS}.some(c=>c.textContent.includes("Second"))`);
		// Grab the column id first: once rename opens, the name span becomes an
		// <input> and "Second" is no longer in textContent, so the stable
		// data-column-id is the only reliable handle.
		const secondId = await c.eval(`(() => { const card=${COLS}.find(c=>c.textContent.includes("Second")); return card ? card.dataset.columnId : null; })()`);
		const renameCol = `document.querySelector('[data-column-id="${secondId}"]')`;
		s.check("found Second column id", !!secondId, "id " + secondId);
		if (secondId) {
			await c.eval(`${renameCol}.querySelector('[title="Double-click to rename"]').dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))`);
			await sleep(150);
			await c.eval(`(() => { const card=${renameCol}; const input=[...card.querySelectorAll("input")].find(i=>!i.closest("form")); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(input,"Second renamed"); input.dispatchEvent(new Event("input",{bubbles:true})); return true; })()`);
			await c.eval(`(() => { const card=${renameCol}; const input=[...card.querySelectorAll("input")].find(i=>!i.closest("form")); input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); return true; })()`);
		}
		await sleep(400);
		const names2 = await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json()).then((b) => b.columns.map((x) => x.name));
		s.check("column rename persisted", names2.includes("Second renamed"), names2.join(", "));

		// 7. Reorder via drag (drop First onto Second).
		// Task boundaries between events: React batches per task, so the drop
		// handler must run in a later task than the dragstart that sets dragId.
		results("7. Drag reorder");
		const dragMk = (type, name) =>
			`(() => {
   const cards=${CARDS};
   const el=cards.find(c=>c.textContent.includes(${JSON.stringify(name)}));
   if(!el) return false;
   el.dispatchEvent(new DragEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
   return true;
 })()`;
		s.check("drag events dispatched", await c.eval(dragMk("dragstart", "First")));
		await sleep(80);
		s.check("dragover+drop dispatched", (await c.eval(dragMk("dragover", "Second"))) && (await c.eval(dragMk("drop", "Second"))));
		await sleep(80);
		await c.eval(dragMk("dragend", "First"));
		await sleep(500);
		const order = await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json()).then((b) => b.columns.map((x) => x.name).join(" -> "));
		s.check("reorder persisted", order.indexOf("Second renamed") < order.indexOf("First"), order);

		// 8. Delete via API; the store (and sidebar) must update over SSE
		results("8. Delete board");
		const del = await authFetch(`${BOARD_URL}/kanban/${boardId}`, { method: "DELETE" });
		s.check("board deleted via API", del.status === 204 || del.status === 200);
		await sleep(800);
		s.check("sidebar updated after delete", !(await c.eval(`document.querySelector("aside")?.textContent?.includes(${JSON.stringify(BOARD)})`)));
	} finally {
		await deleteBoardsNamed(BOARD); // never leave the scratch board behind
	}

	s.check("no uncaught page errors", exc.length === 0, exc.slice(0, 3).join(" | "));
	await c.close();
	return s.summary();
}
