// Structural / chrome regression checks. Robust on any server state: chrome
// assertions hold regardless of session content; content assertions (markdown,
// tool cards) run against the most content-rich existing session.
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, pickRichSession, APP_URL, authenticate } from "./lib.mjs";

const btnByPredicate = (pred) => `(function(){
  const btns=[...document.querySelectorAll('button')];
  const b=btns.find(${pred});
  if(!b) return {ok:false, n:btns.length};
  b.scrollIntoView({block:'center'}); b.click();
  return {ok:true, text:(b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30)};
})()`;
const asideBtnByPredicate = (pred) => `(function(){
  const btns=[...document.querySelectorAll('aside button')];
  const b=btns.find(${pred});
  if(!b) return {ok:false, n:btns.length};
  b.click();
  return {ok:true, text:(b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30)};
})()`;
const scrollInfo = `(function(){
  const md=document.querySelector('.md'); if(!md) return null;
  let el=md.parentElement;
  while(el && el!==document.body){
    const cs=getComputedStyle(el);
    if((cs.overflowY==='auto'||cs.overflowY==='scroll') && el.scrollHeight>el.clientHeight+1)
      return {atBottom: el.scrollHeight-el.scrollTop-el.clientHeight<80, nodes:el.querySelectorAll('.md').length};
    el=el.parentElement;
  }
  return null;
})()`;

export async function run(suitesOut) {
	const s = new Suite("structural");
	const token = await authenticate();
	const rich = await pickRichSession();
	const c = await newPage("about:blank", { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.text || ""));

	// 1. Routing: '/' redirects to a session
	results("1. Routing");
	await c.send("Page.navigate", { url: APP_URL + "/" });
	await sleep(3000);
	const homeUrl = await c.eval("location.href");
	s.check("home '/' redirects to /session/<id>", /\/session\/ses_/.test(homeUrl), homeUrl);

	// 2. Connection banner
	results("2. Connection banner");
	const bannerVisible = await c.eval(`!!document.querySelector('.banner')`);
	const statusDot = await c.eval(`(() => { const d=document.querySelector('.status-dot'); return d ? (d.className.includes('on')||d.className.includes('connected') ? 'on' : 'pending') : null; })()`);
	s.check("no 'Connecting…' banner when server is up", !bannerVisible);
	s.check("sidebar status dot shows connected", statusDot === "on", `dot=${statusDot}`);

	// 3. Sidebar groups + collapse
	results("3. Sidebar groups");
	const visItems = `document.querySelectorAll('nav span[title="Double-click to rename"]').length`;
	const groups = await c.eval(`(function(){
  const nav=document.querySelector('nav'); if(!nav) return null;
  const headers=[...nav.querySelectorAll('button')].filter(b=>/▸|▾/.test(b.textContent));
  return headers.length;
})()`);
	s.check("sessions grouped by directory (>=1 group)", typeof groups === "number" && groups >= 1, `groups=${groups}`);
	const beforeCollapse = await c.eval(visItems);
	const colRes = await c.eval(asideBtnByPredicate(`(b)=>/▸|▾/.test(b.textContent)`));
	await sleep(300);
	const afterCollapse = await c.eval(visItems);
	s.check("collapsing a group hides its session items", colRes.ok && afterCollapse < beforeCollapse, `items ${beforeCollapse}->${afterCollapse}`);
	await c.eval(asideBtnByPredicate(`(b)=>/▸|▾/.test(b.textContent)`)); // re-expand
	await sleep(200);

	// 4-6. Content-dependent (only meaningful if a rich session exists)
	if (rich) {
		await c.send("Page.navigate", { url: `${APP_URL}/session/${rich.id}` });
		await sleep(3000);

		results("4. Message list / markdown");
		const md = await c.eval(`(function(){
	  const mds=[...document.querySelectorAll('.md')];
	  const h=document.querySelector('.md h1, .md h2');
	  const code=document.querySelector('.md code, .md pre');
	  return { mdBlocks:mds.length, hasHeading:!!h, hasCode:!!code };
	})()`);
		s.check("markdown blocks rendered", md.mdBlocks > 0, `${md.mdBlocks} .md blocks`);
		s.check("markdown headings/code render", md.hasHeading || md.hasCode, `heading=${md.hasHeading} code=${md.hasCode}`);

		results("5. Tool cards");
		const toolBefore = await c.eval(`(function(){
	  const heads=[...document.querySelectorAll('button')].filter(b=>/✓|●|…|✕/.test(b.textContent.slice(0,1)) && /read|bash|todowrite|edit|grep|glob|write|webfetch/.test(b.textContent));
	  return { toolHeads:heads.length };
	})()`);
		s.check("tool cards rendered", toolBefore.toolHeads > 0, `${toolBefore.toolHeads} cards`);

		results("6. Autoscroll container (idle)");
		const sc = await c.eval(scrollInfo);
		s.check("message list is the scroll container", !!sc, JSON.stringify(sc));
		if (sc) s.check("list pinned to bottom when idle", sc.atBottom);
	} else {
		results("4-6. content checks skipped (no existing sessions)");
	}

	// 7. Todos panel toggle
	results("7. Todos panel");
	await c.eval(btnByPredicate(`(b)=>(b.textContent||'').trim().startsWith('Todos')`));
	await sleep(600);
	const todosOpen = await c.eval(`[...document.querySelectorAll('aside.panel')].some(p=>(p.querySelector('.panel-title')||{}).textContent==='Todos')`);
	s.check("Todos panel opens on toggle", todosOpen);
	await c.eval(btnByPredicate(`(b)=>(b.textContent||'').trim().startsWith('Todos')`));
	await sleep(300);
	const todosClosed = await c.eval(`![...document.querySelectorAll('aside.panel')].some(p=>(p.querySelector('.panel-title')||{}).textContent==='Todos')`);
	s.check("Todos panel closes on second toggle", todosClosed);

	// 8. Files panel toggle
	results("8. Files panel");
	await c.eval(btnByPredicate(`(b)=>(b.textContent||'').trim()==='Files' || (b.textContent||'').trim().startsWith('Files (')`));
	await sleep(800);
	const files = await c.eval(`(function(){
	  const p=[...document.querySelectorAll('aside.panel')].find(x=>(x.querySelector('.panel-title')||{}).textContent==='Files');
	  if(!p) return null;
	  return { present:true, hasRefresh:!!p.querySelector('[title="Refresh"]') };
	})()`);
	s.check("Files panel opens on toggle", files?.present);
	s.check("Files panel has refresh button", files?.hasRefresh);
	await c.eval(btnByPredicate(`(b)=>(b.textContent||'').trim()==='Files' || (b.textContent||'').trim().startsWith('Files (')`));
	await sleep(200);

	// 9. Server modal (MCP + Plugins tabs, Escape closes)
	results("9. Server panel");
	const serverBtn = await c.eval(asideBtnByPredicate(`(b)=>(b.textContent||'').trim()==='Server'`));
	await sleep(300);
	const modalTitle = await c.eval(`document.querySelector('.modal-title')?.textContent||null`);
	s.check("Server button opens Server modal", serverBtn.ok && modalTitle === "Server", `title='${modalTitle}'`);
	const tabs = await c.eval(`(function(){
	  const dlg=document.querySelector('[role="dialog"]');
	  const b=[...dlg.querySelectorAll('button')].map(x=>(x.textContent||'').trim());
	  return { mcp:b.some(x=>x.startsWith('MCP')), plugins:b.some(x=>x.startsWith('Plugins')) };
	})()`);
	s.check("MCP tab present", tabs.mcp);
	s.check("Plugins tab present", tabs.plugins);
	await c.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
	await sleep(300);
	s.check("Escape closes modal", await c.eval(`!document.querySelector('[role="dialog"]')`));

	// 10. Theme toggle (light/dark)
	results("10. Theme toggle");
	const themeBefore = await c.eval(`document.documentElement.dataset.theme || null`);
	const bgBefore = await c.eval(`getComputedStyle(document.body).backgroundColor`);
	const themeBtnOk = await c.eval(`(function(){
	  const b=document.querySelector('[data-theme-toggle]');
	  if(!b) return false;
	  b.click();
	  return /Switch to (dark|light) theme/.test(b.getAttribute('aria-label'));
	})()`);
	await sleep(300);
	const themeAfter = await c.eval(`document.documentElement.dataset.theme || null`);
	const bgAfter = await c.eval(`getComputedStyle(document.body).backgroundColor`);
	s.check("theme toggle button present + labelled", themeBtnOk);
	s.check("theme toggle flips data-theme", themeBefore && themeAfter && themeBefore !== themeAfter, `${themeBefore} -> ${themeAfter}`);
	s.check("theme toggle repaints the page", bgBefore !== bgAfter, `${bgBefore} -> ${bgAfter}`);
	// Flip back so later checks run in the original theme.
	await c.eval(`document.querySelector('[data-theme-toggle]')?.click()`);
	await sleep(200);
	s.check("theme restores on second toggle", (await c.eval(`document.documentElement.dataset.theme`)) === themeBefore);

	// 11. Mobile drawer
	results("11. Mobile (390px)");
	await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await sleep(800);
	const menuBtn = await c.eval(`(function(){ const b=document.querySelector('button[aria-label="Open menu"]'); return b && getComputedStyle(b).display!=='none' && b.offsetParent!==null; })()`);
	s.check("mobile header menu visible at 390px", menuBtn);
	await c.eval(`(function(){ document.querySelector('button[aria-label="Open menu"]')?.click(); })()`);
	await sleep(500);
	const drawerState = await c.eval(`(function(){
	  const aside=document.querySelector('aside');
	  const scrim=document.querySelector('.scrim')||[...document.querySelectorAll('div')].find(d=>String(d.className).includes('scrim'));
	  return { width: aside.getBoundingClientRect().width, hasScrim: !!scrim };
	})()`);
	s.check("menu opens sidebar drawer + scrim", drawerState.width > 0 && drawerState.hasScrim, JSON.stringify(drawerState));
	await c.send("Emulation.clearDeviceMetricsOverride");
	await sleep(300);

	// 12. Question overflow contract (short viewport): the questions container
	// must be a bounded, internally-scrolling region so many questions never push
	// the composer below the fold. Real questions are model-backed and not
	// deterministic in e2e, so assert the compiled CSS contract directly: locate
	// the container's CSS-module rule (the only rule pairing overflow-y
	// auto/scroll with a dvh max-height) and confirm a probe element carrying that
	// class resolves to a bounded scrolling box at a short viewport.
	results("12. Question overflow contract (short viewport)");
	await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 520, deviceScaleFactor: 2, mobile: true });
	await sleep(500);
	const qOverflow = await c.eval(`(function(){
	  var cls = null, ruleText = "";
	  for (var si = 0; si < document.styleSheets.length; si++) {
	    var rules; try { rules = document.styleSheets[si].cssRules; } catch (e) { continue; }
	    if (!rules) continue;
	    for (var ri = 0; ri < rules.length; ri++) {
	      var r = rules[ri];
	      if (r.style && /overflow-y\\s*:\\s*(auto|scroll)/.test(r.style.cssText) && /max-height\\s*:[^;]*dvh/.test(r.style.cssText)) {
	        var m = (r.selectorText || "").match(/^\\s*\\.[A-Za-z0-9_-]+/);
	        if (m) { cls = m[0].trim().slice(1); ruleText = r.style.cssText; }
	      }
	    }
	  }
	  if (!cls) return { found: false, cls: null };
	  var probe = document.createElement("div");
	  probe.className = cls;
	  for (var i = 0; i < 8; i++) { var d = document.createElement("div"); d.style.flex = "0 0 auto"; d.style.height = "300px"; probe.appendChild(d); }
	  document.body.appendChild(probe);
	  var cs = getComputedStyle(probe);
	  var mhMatch = ruleText.match(/max-height\\s*:\\s*([^;]+);/);
	  var out = {
	    found: true, cls: cls, overflowY: cs.overflowY, computedMaxHeight: cs.maxHeight,
	    ruleMaxHeight: mhMatch ? mhMatch[1].trim() : null, clientH: probe.clientHeight, scrollH: probe.scrollHeight
	  };
	  probe.remove();
	  return out;
	})()`);
	const qPass =
		qOverflow.found &&
		(qOverflow.overflowY === "auto" || qOverflow.overflowY === "scroll") &&
		qOverflow.computedMaxHeight !== "none" &&
		/dvh/.test(qOverflow.ruleMaxHeight || "");
	s.check(
		"question cards are a bounded scrolling region (overflow-y + dvh max-height)",
		qPass,
		JSON.stringify(qOverflow)
	);
	await c.send("Emulation.clearDeviceMetricsOverride");
	await sleep(200);

	s.check("no uncaught exceptions during structural suite", exc.length === 0, exc.slice(0, 3).join(" | "));

	await c.close();
	return s.summary();
}
