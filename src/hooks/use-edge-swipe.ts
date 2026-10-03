import { useEffect, useRef } from "react";

const EDGE_PX = 24;
const SWIPE_PX = 50;

// iOS-style edge gestures for the mobile nav drawer: a rightward swipe that
// begins at the left edge opens it, a leftward swipe closes it. Only active on
// coarse-pointer / touch devices at the mobile breakpoint, so it never fights
// desktop layout or the board's pointer drag-and-drop. Listeners are passive —
// we never preventDefault, so normal scrolling and native gestures keep working.
export function useEdgeSwipe({
	drawerOpen,
	onOpen,
	onClose,
}: {
	drawerOpen: boolean;
	onOpen: () => void;
	onClose: () => void;
}) {
	const openRef = useRef(drawerOpen);
	const onOpenRef = useRef(onOpen);
	const onCloseRef = useRef(onClose);
	const gesture = useRef({
		active: false,
		fired: false,
		startX: 0,
		startY: 0,
		fromLeftEdge: false,
	});

	// Keep the refs in sync (after render) so the once-attached listeners always
	// see the latest drawer state and callbacks.
	useEffect(() => {
		openRef.current = drawerOpen;
		onOpenRef.current = onOpen;
		onCloseRef.current = onClose;
	});

	useEffect(() => {
		const coarse = window.matchMedia("(pointer: coarse)");
		const fine = window.matchMedia("(pointer: fine)");
		const mobile = window.matchMedia("(max-width: 900px)");
		// A touch/coarse device is one that is not a fine (mouse) pointer: real
		// desktops report pointer: fine, phones/tablets do not. Headless browsers
		// report neither, so !fine keeps the gesture testable there as well.
		const isTouch = () => coarse.matches || "ontouchstart" in window || !fine.matches;
		const enabled = () => isTouch() && mobile.matches;

		function onTouchStart(e: TouchEvent) {
			if (!enabled()) return;
			const t = e.touches[0];
			if (!t) return;
			const g = gesture.current;
			g.active = true;
			g.fired = false;
			g.startX = t.clientX;
			g.startY = t.clientY;
			g.fromLeftEdge = t.clientX <= EDGE_PX;
		}

		function onTouchMove(e: TouchEvent) {
			const g = gesture.current;
			if (!g.active || g.fired || !enabled()) return;
			const t = e.touches[0];
			if (!t) return;
			const dx = t.clientX - g.startX;
			const dy = t.clientY - g.startY;
			if (Math.abs(dx) <= Math.abs(dy)) return; // mostly vertical
			if (!openRef.current && g.fromLeftEdge && dx >= SWIPE_PX) {
				g.fired = true;
				onOpenRef.current();
				return;
			}
			if (openRef.current && dx <= -SWIPE_PX) {
				g.fired = true;
				onCloseRef.current();
			}
		}

		function onTouchEnd() {
			gesture.current.active = false;
			gesture.current.fired = false;
		}

		document.addEventListener("touchstart", onTouchStart, { passive: true });
		document.addEventListener("touchmove", onTouchMove, { passive: true });
		document.addEventListener("touchend", onTouchEnd, { passive: true });
		return () => {
			document.removeEventListener("touchstart", onTouchStart);
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", onTouchEnd);
		};
	}, []);
}
