// Mobile edge-swipe: a rightward swipe that begins at the left edge opens the
// nav drawer, a leftward swipe closes it. Runs on an emulated 390px touch device
// and only exercises the mobile layout (desktop is unaffected by the handler).
import { newPage, sleep, results } from "./cdp.mjs";
import { Suite, APP_URL, authenticate } from "./lib.mjs";

// Dispatch a synthetic touch gesture (start -> move -> end) that bubbles up to
// document, where the handler is attached. Coordinates are clientX/clientY.
const swipe = (x1, y1, x2, y2) => `(function(){
  const target = document.body;
  const mk = (x, y) => new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y });
  const a = mk(${x1}, ${y1});
  const b = mk(${x2}, ${y2});
  target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [a], targetTouches: [a], changedTouches: [a] }));
  target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [b], targetTouches: [b], changedTouches: [b] }));
  target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [b] }));
  return true;
})()`;

// The scrim is rendered only while the drawer is open.
const hasScrim = `[...document.querySelectorAll('div')].some(d => String(d.className).includes('scrim'))`;

// The mobile drawer is a fixed-position <aside>.
const asideFixed = `(function(){ const a = document.querySelector('aside'); return a ? getComputedStyle(a).position === 'fixed' : false; })()`;

// Diagnostics for the touch/breakpoint gate.
const gateInfo = `(function(){
  return {
    coarse: window.matchMedia('(pointer: coarse)').matches,
    fine: window.matchMedia('(pointer: fine)').matches,
    touch: 'ontouchstart' in window,
    mobile: window.matchMedia('(max-width: 900px)').matches,
  };
})()`;

// Mirrors the production gate: a touch/coarse (non-fine) device at the mobile width.
const gateActive = (g) => (g.coarse || g.touch || !g.fine) && g.mobile;

export async function run() {
	const s = new Suite("mobile-swipe");
	const token = await authenticate();
	const c = await newPage(APP_URL, { token });
	const exc = [];
	c.on("Runtime.exceptionThrown", (p) => exc.push(p.exceptionDetails?.text || ""));
	await sleep(2500);

	// Emulate a phone, then reload so the mobile layout applies.
	await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await c.send("Page.reload");
	await sleep(3000);

	results("1. Mobile emulation");
	const gate = await c.eval(gateInfo);
	s.check("sidebar is a fixed drawer at 390px", await c.eval(asideFixed));
	s.check("touch gate is active (coarse|ontouchstart|!fine) && mobile", gateActive(gate), JSON.stringify(gate));

	results("2. Left-edge rightward swipe opens");
	if (await c.eval(hasScrim)) await c.eval(swipe(200, 400, 40, 410)); // defensive: start closed
	await sleep(300);
	await c.eval(swipe(5, 400, 130, 410));
	await sleep(400);
	s.check("left-edge rightward swipe opens the drawer", await c.eval(hasScrim));

	results("3. Leftward swipe closes");
	await c.eval(swipe(200, 400, 40, 410));
	await sleep(400);
	s.check("leftward swipe closes the drawer", !(await c.eval(hasScrim)));

	results("4. Negative: non-edge rightward swipe");
	await c.eval(swipe(200, 400, 300, 410));
	await sleep(300);
	s.check("non-edge rightward swipe does NOT open", !(await c.eval(hasScrim)));

	results("5. Negative: mostly-vertical edge swipe");
	await c.eval(swipe(5, 400, 12, 540));
	await sleep(300);
	s.check("mostly-vertical edge swipe does NOT open", !(await c.eval(hasScrim)));

	s.check("no uncaught exceptions during mobile-swipe suite", exc.length === 0, exc.slice(0, 3).join(" | "));

	await c.send("Emulation.clearDeviceMetricsOverride");
	await c.close();
	return s.summary();
}
