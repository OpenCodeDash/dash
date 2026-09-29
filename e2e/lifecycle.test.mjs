// Session lifecycle via the UI directory picker: create, rename, delete.
// Self-contained — creates its own scratch session in a temp dir and cleans up.
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, deleteSession } from "./lib.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const setVal = (selExpr, val) => `(function(){
  const el=document.querySelector(${JSON.stringify(selExpr)}); if(!el) return {ok:false};
  const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype : el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  return {ok:true, val:el.value};
})()`;

// poll until the sidebar group `name` is present
async function findGroup(c, name, timeout = 8000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const g = await c.eval(`(function(){
	  const h=[...document.querySelectorAll('aside button')].find(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(name)}));
	  if(!h) return null;
	  const span=h.parentElement.querySelector('span[title="Double-click to rename"]');
	  return { found:true, title:span?span.textContent:null };
	})()`);
		if (g && g.found) return g;
		await sleep(200);
	}
	return null;
}

export async function run() {
	const s = new Suite("lifecycle");
	const scratchDir = mkdtempSync(join(tmpdir(), "opencode-e2e-"));
	const groupKey = scratchDir.split("/").pop();

	const c = await newPage(APP_URL);
	await sleep(3000);

	// A. Directory picker: navigate + create
	results("A. Directory picker — navigate + create");
	await c.eval(`document.querySelector('button[title="New session"]').click()`);
	await sleep(400);
	s.check("picker modal opens from 'New session'", await c.eval(`!!document.querySelector('.modal-title')`));
	await sleep(600);
	await c.eval(setVal(`input[aria-label="Directory path"]`, scratchDir));
	await c.eval(`(function(){ const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.textContent||'').trim()==='Go'); b?.click(); })()`);
	await sleep(1000);
	const afterGo = await c.eval(`(function(){
	  const dlg=document.querySelector('[role="dialog"]');
	  const footer=dlg.querySelector('[class*=footer]');
	  return { footer: footer?.textContent?.trim()||'', hasCreate: [...dlg.querySelectorAll('button')].some(b=>(b.textContent||'').startsWith('Create session')) };
	})()`);
	s.check("Go navigates to the target directory", (afterGo.footer || "").includes(groupKey), JSON.stringify(afterGo));
	const createRes = await c.eval(`(function(){
	  const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.textContent||'').trim().startsWith('Create session'));
	  if(!b) return {ok:false}; b.click(); return {ok:true};
	})()`);
	await sleep(1500);
	const newId = (await c.eval("location.href")).match(/session\/(ses_\w+)/)?.[1];
	s.check("Create session → navigates to new session", createRes.ok && !!newId);
	const grp = await findGroup(c, groupKey);
	s.check("new session appears under its directory group", grp?.found, JSON.stringify(grp));

	// B. Rename
	results("B. Rename (double-click)");
	const renamed = await c.eval(`(function(){
	  const h=[...document.querySelectorAll('aside button')].find(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(groupKey)}));
	  const span=h?.parentElement.querySelector('span[title="Double-click to rename"]'); if(!span) return {ok:false};
	  span.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
	  return {ok:true};
	})()`);
  await sleep(400);
  // set the value and dispatch input, then let React commit the state
  // before Enter reads it — dispatching both in one synchronous tick means
  // the keydown handler sees the stale (unflushed) controlled value.
  const setRename = await c.eval(`(function(){
    const h=[...document.querySelectorAll('aside button')].find(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(groupKey)}));
    const inp=h?.parentElement.querySelector('input'); if(!inp) return {ok:false};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp,'e2e-renamed');
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return {ok:true};
  })()`);
  await sleep(300);
  const commitRename = await c.eval(`(function(){
    const h=[...document.querySelectorAll('aside button')].find(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(groupKey)}));
    const inp=h?.parentElement.querySelector('input'); if(!inp) return {ok:false};
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    return {ok:true};
  })()`);
  await sleep(1200);
  const afterRename = await findGroup(c, groupKey);
  s.check("double-click renames the session item", renamed.ok && setRename.ok && commitRename.ok && afterRename?.title === "e2e-renamed", `title='${afterRename?.title}'`);

	// C. Delete (confirm auto-true)
	results("C. Delete");
	await c.eval("window.confirm=()=>true");
	const del = await c.eval(`(function(){
	  const h=[...document.querySelectorAll('aside button')].find(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(groupKey)}));
	  const item=h?.parentElement.querySelector('span[title="Double-click to rename"]')?.parentElement;
	  const btn=item?.querySelector('button[title="Delete session"]'); if(!btn) return {ok:false}; btn.click(); return {ok:true};
	})()`);
	await sleep(1500);
	const grpGone = await c.eval(`(function(){ return ![...document.querySelectorAll('aside button')].some(b=>/▸|▾/.test(b.textContent)&&(b.textContent||'').includes(${JSON.stringify(groupKey)})); })()`);
	s.check("delete (confirmed) removes the group", del.ok && grpGone);

	await c.close();
	rmSync(scratchDir, { recursive: true, force: true });
	// belt-and-suspenders cleanup of the session if the UI delete left it
	if (newId) await deleteSession(newId);
	return s.summary();
}
