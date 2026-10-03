// Task integration (dash <-> react-backdash <-> backdash server).
// Full flow in the browser: task create / rename / drag-reorder within a column /
// cross-column move / delete / claim / release, asserting against both the DOM
// and the server API. Boards are seeded with Todo (queue) / In Progress / Done,
// so the suite works against those real columns. Needs the backdash server
// (default :3000, BOARD_URL env).
import { newPage, sleep, typeSel, results } from "./cdp.mjs";
import { Suite, APP_URL, BOARD_URL, authenticate, authFetch } from "./lib.mjs";

const BOARD = "e2e Tasks";
const TASKS = `[...document.querySelectorAll('[data-task-id]')]`;
const COLS = `[...document.querySelectorAll('[data-column-id]')]`;

const clickByText = (sel, text) =>
	`(() => { const els=[...document.querySelectorAll(${JSON.stringify(sel)})]; const el=els.find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!el) return {ok:false, err:"no button found"}; el.scrollIntoView({block:"center"}); el.click(); return {ok:true}; })()`;

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

// Add a task to a column through the UI add-task form (the submit button lives
// inside the same form, so it is unambiguous even with many columns).
async function addTask(c, col, name) {
	await c.eval(typeSel(`input[aria-label="New task in ${col}"]`, name));
	await c.eval(
		`(() => {
		const i=document.querySelector(${JSON.stringify(`input[aria-label="New task in ${col}"`)});
		if(!i) return {ok:false};
		const btn=i.closest("form").querySelector('button[type="submit"]');
		if(!btn || btn.disabled) return {ok:false, err:"no submit button"};
		btn.click(); return {ok:true};
	})()`,
	);
}

// Dispatch a synthetic drag event on the task card whose text includes `name`.
const dragTask = (type, name) =>
	`(() => {
	const el=${TASKS}.find(t=>t.textContent.includes(${JSON.stringify(name)}));
	if(!el) return false;
	el.dispatchEvent(new DragEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
	return true;
})()`;

// Dispatch a synthetic drag event on the column card whose header includes `name`.
const dragColumn = (type, name) =>
	`(() => {
	const el=${COLS}.find(c=>c.textContent.includes(${JSON.stringify(name)}));
	if(!el) return false;
	el.dispatchEvent(new DragEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
	return true;
})()`;

// Ordered task names per column, keyed by column name, straight from the server.
async function serverTasks(boardId) {
	const b = await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json());
	const out = {};
	for (const c of b.columns) out[c.name] = c.tasks.map((t) => t.name);
	return out;
}

// Full board (all tasks, all columns) straight from the server.
async function serverBoard(boardId) {
	return await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json());
}

const openEditor = (name) =>
	`(() => { const el=${TASKS}.find(t=>t.textContent.includes(${JSON.stringify(name)})); if(!el) return false; el.querySelector('[title="Edit task"]').click(); return true; })()`;

// Click the Add button of the editor's "New todo" form (the input's own form).
const clickEditorTodoAdd = `(() => { const i=document.querySelector('input[aria-label="New todo"]'); if(!i) return false; const b=i.closest("form").querySelector('button[type="submit"]'); if(!b||b.disabled) return false; b.click(); return true; })()`;

// Submit the whole editor form (the footer Save button, bound via form="task-editor-form").
const saveEditor = `(() => { const b=document.querySelector('button[form="task-editor-form"]'); if(!b) return false; b.click(); return true; })()`;

// Click the first editor todo status button whose current label is `label`
// (labels advance pending -> in progress -> done as it is cycled).
const clickFirstStatus = (label) =>
	`(() => { const b=document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}); if(!b) return false; b.click(); return true; })()`;

export async function run() {
	const s = new Suite("tasks");
	await deleteBoardsNamed(BOARD); // idempotent start: clear leftovers from a failed run

	const token = await authenticate();
	const c = await newPage(`${APP_URL}/boards`, { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "unknown"));
	c.on("Page.javascriptDialogOpening", () => c.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {}));

	let boardId = "";
	try {
		// 1. Create a board via the UI (auto-seeded with Todo/In Progress/Done)
		results("1. Create board");
		await c.eval(typeSel('input[placeholder="New board name"]', BOARD));
		s.check("create board clicked", (await c.eval(clickByText("button", "Create"))).ok);
		s.check("board row appears", await waitEval(c, `[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Open")`));

		// 2. Open it
		results("2. Open board");
		await c.eval(clickByText("button", "Open"));
		s.check("navigated to board page", await waitEval(c, `location.pathname.startsWith("/boards/")`));
		boardId = await c.eval(`location.pathname.split("/").pop()`);
		await waitEval(c, `${COLS}.length >= 3`);
		const seeded = await c.eval(`${COLS}.map(x=>x.textContent).join("|")`);
		s.check("board seeded with default columns", /Todo/.test(seeded) && /In Progress/.test(seeded) && /Done/.test(seeded), seeded);

		// 3. Create two tasks in "In Progress" via the UI
		results("3. Create tasks");
		await addTask(c, "In Progress", "Alpha");
		await addTask(c, "In Progress", "Beta");
		await sleep(500);
		let tasks = await serverTasks(boardId);
		s.check("two tasks created in In Progress", (tasks["In Progress"] || []).length === 2, JSON.stringify(tasks));
		s.check("server order is [Alpha, Beta]", JSON.stringify(tasks["In Progress"] || []) === JSON.stringify(["Alpha", "Beta"]), JSON.stringify(tasks["In Progress"] || []));

		// 3b. A long multi-word title wraps to multiple lines instead of being
		//     clipped with an ellipsis (the title now sits in its own full-width
		//     row below the handle/actions row). Created in Done so the exact
		//     [Alpha, Beta] order assertions above are untouched.
		results("3b. Long title wraps");
		await addTask(c, "Done", "Long multi word title that wraps across several lines instead of truncating");
		await sleep(500);
		// whiteSpace must not be nowrap, a wrapping policy must be set, and the
		// rendered title must be taller than one line. Single-line height is
		// measured with a hidden nowrap probe sharing the title's own class,
		// since computed lineHeight is "normal" (not a px value).
		const wrap = await c.eval(`(() => {
		const el=[...document.querySelectorAll('[data-task-name]')].find(e=>e.textContent.includes("wraps across several lines"));
		if(!el) return {ok:false, err:"title element not found"};
		const cs=getComputedStyle(el);
		const wrapEnabled = cs.whiteSpace !== "nowrap" && (["anywhere","break-word","break-words"].includes(cs.overflowWrap) || ["break-word","break-all"].includes(cs.wordBreak));
		const probe=document.createElement("span");
		probe.style.cssText="position:absolute;visibility:hidden;white-space:nowrap;";
		probe.className=el.className;
		probe.textContent="x";
		el.appendChild(probe);
		const single=probe.offsetHeight;
		probe.remove();
		const multiLine = el.offsetHeight > single * 1.5;
		return {ok: wrapEnabled && multiLine, whiteSpace: cs.whiteSpace, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak, height: el.offsetHeight, singleLine: single};
	})()`);
		s.check("long title wraps to multiple lines", wrap.ok, JSON.stringify(wrap));

		// 4. Rename Alpha -> "Alpha 2" via double-click
		results("4. Rename task");
		const alphaId = await c.eval(`(() => { const el=${TASKS}.find(t=>t.textContent.includes("Alpha")); return el ? el.dataset.taskId : null; })()`);
		s.check("found Alpha task card", !!alphaId, "id " + alphaId);
		await c.eval(`document.querySelector('[data-task-id="${alphaId}"]').querySelector('[data-task-name]').dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))`);
		await sleep(150);
		await c.eval(
			`(() => {
			const input=document.querySelector('[data-task-id="${alphaId}"] input');
			const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
			setter.call(input,"Alpha 2");
			input.dispatchEvent(new Event("input",{bubbles:true}));
			return true;
		})()`,
		);
		await c.eval(`(() => { const input=document.querySelector('[data-task-id="${alphaId}"] input'); input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); return true; })()`);
		await sleep(500);
		tasks = await serverTasks(boardId);
		s.check("task rename persisted", (tasks["In Progress"] || []).includes("Alpha 2"), JSON.stringify(tasks));

		// 5. Reorder within the column: drag Beta, drop on "Alpha 2" (insert before).
		results("5. Reorder within column");
		s.check("dragstart dispatched", await c.eval(dragTask("dragstart", "Beta")));
		await sleep(80);
		s.check("dragover+drop dispatched", (await c.eval(dragTask("dragover", "Alpha 2"))) && (await c.eval(dragTask("drop", "Alpha 2"))));
		await sleep(80);
		await c.eval(dragTask("dragend", "Beta"));
		await sleep(500);
		tasks = await serverTasks(boardId);
		const ip = tasks["In Progress"] || [];
		s.check("reorder persisted as [Beta, Alpha 2]", JSON.stringify(ip) === JSON.stringify(["Beta", "Alpha 2"]), JSON.stringify(ip));

		// 6. Cross-column move: drag Beta, drop on the "Done" column.
		results("6. Cross-column move");
		await c.eval(dragTask("dragstart", "Beta"));
		await sleep(80);
		s.check("drop on Done dispatched", (await c.eval(dragColumn("dragover", "Done"))) && (await c.eval(dragColumn("drop", "Done"))));
		await sleep(80);
		await c.eval(dragTask("dragend", "Beta"));
		await sleep(500);
		tasks = await serverTasks(boardId);
		s.check("task moved into Done", (tasks["Done"] || []).includes("Beta"), JSON.stringify(tasks));
		s.check("task left In Progress", !(tasks["In Progress"] || []).includes("Beta"), JSON.stringify(tasks));

		// 7. Delete a task via the UI
		results("7. Delete task");
		await c.eval(`(() => { const el=${TASKS}.find(t=>t.textContent.includes("Alpha 2")); el.querySelector('[title="Delete task"]').click(); return true; })()`);
		await sleep(500);
		tasks = await serverTasks(boardId);
		s.check("task deleted from server", !(tasks["In Progress"] || []).includes("Alpha 2"), JSON.stringify(tasks));

		// 8. Claim then release a task in the seeded queue column (Todo).
		results("8. Claim & release");
		await addTask(c, "Todo", "Gamma");
		await sleep(400);
		await c.eval(`(() => { const el=${TASKS}.find(t=>t.textContent.includes("Gamma")); el.querySelector('[title="Claim the task"]').click(); return true; })()`);
		await sleep(400);
		const g1 = (await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json())).columns.find((c) => c.name === "Todo").tasks.find((t) => t.name === "Gamma");
		s.check("task claimed (claimedBy set)", !!g1 && !!g1.claimedBy, JSON.stringify(g1?.claimedBy ?? null));
		s.check("release button appears after claim", await c.eval(`!!${TASKS}.find(t=>t.textContent.includes("Gamma"))?.querySelector('[title="Release the task"]')`));
		await c.eval(`(() => { const el=${TASKS}.find(t=>t.textContent.includes("Gamma")); const b=el.querySelector('[title="Release the task"]'); if(b) b.click(); return true; })()`);
		await sleep(400);
		const g2 = (await authFetch(`${BOARD_URL}/kanban/${boardId}`).then((r) => r.json())).columns.find((c) => c.name === "Todo").tasks.find((t) => t.name === "Gamma");
		s.check("task released (claimedBy cleared)", !!g2 && !g2.claimedBy, JSON.stringify(g2?.claimedBy ?? null));

		// 9. Task todos: add two via the editor, verify the server persisted them
		//    and the card shows a progress badge; then complete one and re-verify.
		results("9. Task todos (editor + badge)");
		await addTask(c, "In Progress", "Delta");
		await sleep(400);
		s.check("editor opened for Delta", await c.eval(openEditor("Delta")));
		await sleep(300);
		await c.eval(typeSel('input[aria-label="New todo"]', "first step"));
		s.check("todo 1 added to editor", await c.eval(clickEditorTodoAdd));
		await c.eval(typeSel('input[aria-label="New todo"]', "second step"));
		s.check("todo 2 added to editor", await c.eval(clickEditorTodoAdd));
		await sleep(200);
		s.check("editor saved (todos)", await c.eval(saveEditor));
		await sleep(500);
		let delta = (await serverBoard(boardId)).columns.flatMap((col) => col.tasks).find((t) => t.name === "Delta");
		s.check("server persisted 2 todos", !!delta && delta.todos?.length === 2, JSON.stringify(delta?.todos ?? null));
		s.check("progress badge shows 0/2", await c.eval(`!!${TASKS}.find(t=>t.textContent.includes("Delta"))?.textContent.includes("0/2")`));

		s.check("editor reopened for Delta", await c.eval(openEditor("Delta")));
		await sleep(300);
		s.check("todo 1 -> in progress", await c.eval(clickFirstStatus("Pending — click to mark in progress")));
		s.check("todo 1 -> completed", await c.eval(clickFirstStatus("In progress — click to mark done")));
		await sleep(150);
		s.check("editor saved (toggle)", await c.eval(saveEditor));
		await sleep(500);
		delta = (await serverBoard(boardId)).columns.flatMap((col) => col.tasks).find((t) => t.name === "Delta");
		s.check("first todo now completed", !!delta && delta.todos?.[0]?.status === "completed", JSON.stringify(delta?.todos ?? null));
		s.check("progress badge shows 1/2", await c.eval(`!!${TASKS}.find(t=>t.textContent.includes("Delta"))?.textContent.includes("1/2")`));

		// 10. Delete the board via the API; the sidebar must drop it over SSE.
		results("10. Delete board");
		await c.send("Page.navigate", { url: APP_URL + "/" });
		await sleep(400);
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
