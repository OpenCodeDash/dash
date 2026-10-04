// Regression checks for the custom dropdown (#50): the model/agent pickers in
// the prompt composer open upward and must never render off screen, at desktop
// and mobile widths. Also covers the scrollIntoView regression that shifted the
// whole app sideways when a list overflowed the viewport.
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, newScratchSession, deleteSession, APP_URL, authenticate } from "./lib.mjs";

// Open the dropdown whose trigger has the given title (Model, Agent, …).
const openTrigger = (title) =>
	`(() => { const b = document.querySelector('button[title=${JSON.stringify(title)}]'); if (!b) return false; b.click(); return true; })()`;

// Geometry of the open listbox plus the app column's horizontal scroll.
const listMetrics = `(() => {
  const lb = document.querySelector('[role="listbox"]');
  if (!lb) return null;
  const r = lb.getBoundingClientRect();
  const app = document.querySelector('[class*="_app_"]');
  return {
    top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height,
    innerW: window.innerWidth, innerH: window.innerHeight,
    up: /listUp/.test(lb.className),
    visibleOptions: [...lb.children].filter((o) => { const or = o.getBoundingClientRect(); return or.top < window.innerHeight && or.bottom > 0; }).length,
    appScrollLeft: app ? app.scrollLeft : 0,
  };
})()`;

const closeList = `document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`;

async function waitForComposer(c) {
	return await c.eval(
		`new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { if (document.querySelector('textarea')) { clearInterval(iv); res(true); } else if (Date.now() - t0 > 10000) { clearInterval(iv); res(false); } }, 150); })`,
		{ awaitPromise: true }
	);
}

export async function run() {
	const s = new Suite("dropdown");
	const token = await authenticate();
	const scratch = await newScratchSession("e2e dropdown position");
	const c = await newPage(`${APP_URL}/session/${scratch.id}`, { token });
	try {
		s.check("composer mounted", await waitForComposer(c));

		for (const [w, h] of [[1280, 800], [375, 667]]) {
			await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
			await sleep(350);
			results(`dropdown within viewport @ ${w}x${h}`);
			for (const title of ["Model", "Agent"]) {
				await c.eval(openTrigger(title));
				await sleep(250);
				const m = await c.eval(listMetrics);
				const within = !!m && m.top >= 0 && m.bottom <= m.innerH && m.left >= 0 && m.right <= m.innerW;
				s.check(
					`${title} list stays within the viewport`,
					within,
					m ? `rect=(${Math.round(m.top)},${Math.round(m.left)},${Math.round(m.bottom)},${Math.round(m.right)}) vp=${m.innerW}x${m.innerH} up=${m.up}` : "listbox not found"
				);
				s.check(`${title} list has a visible option`, !!m && m.visibleOptions >= 1, m ? `visible=${m.visibleOptions}` : "");
				s.check(`${title} opening does not scroll the app sideways`, !!m && m.appScrollLeft === 0, m ? `scrollLeft=${m.appScrollLeft}` : "");
				await c.eval(closeList);
				await sleep(150);
			}
		}
	} finally {
		await c.close();
		await deleteSession(scratch.id);
	}
	return s.summary();
}
