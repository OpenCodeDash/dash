import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./dropdown.module.scss";

export interface DropdownOption {
	value: string;
	label: string;
}

/** Gap between the trigger and the list, in px (matches the .list margins). */
const GAP = 4;
/** Never shrink the list below this so at least one option stays reachable. */
const MIN_LIST_HEIGHT = 48;
/** Matches the CSS max-height of .list; the inline clamp only ever goes lower. */
const MAX_LIST_HEIGHT = 288;

interface Placement {
	/** True when there is more room above the trigger than below it. */
	up: boolean;
	/** Viewport-clamped height for the list. */
	maxHeight: number;
}

interface DropdownProps {
	value: string;
	onChange: (value: string) => void;
	options: DropdownOption[];
	/** Tooltip on the trigger; also its accessible name when ariaLabel is absent. */
	title?: string;
	/** Accessible name for the trigger (used as-is by screen readers). */
	ariaLabel?: string;
}

export function Dropdown({ value, onChange, options, title, ariaLabel }: DropdownProps) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const [placement, setPlacement] = useState<Placement | null>(null);
	const [shiftX, setShiftX] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const uid = useId();

	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-opt-${i}`;
	const selected = options.find((o) => o.value === value);
	const currentLabel = selected?.label ?? "";

	// Choose the direction with more room in the viewport and clamp the list's
	// height to it, so the list can never render off screen.
	function computePlacement(): Placement {
		const rect = triggerRef.current?.getBoundingClientRect();
		if (!rect) return { up: false, maxHeight: MAX_LIST_HEIGHT };
		const spaceDown = window.innerHeight - rect.bottom - GAP;
		const spaceUp = rect.top - GAP;
		const up = spaceUp > spaceDown;
		const maxHeight = Math.min(MAX_LIST_HEIGHT, Math.max(MIN_LIST_HEIGHT, up ? spaceUp : spaceDown));
		return { up, maxHeight };
	}

	function openList() {
		const idx = options.findIndex((o) => o.value === value);
		setActive(idx >= 0 ? idx : 0);
		setPlacement(computePlacement());
		setShiftX(0);
		setOpen(true);
	}

	function closeList(refocus: boolean) {
		setOpen(false);
		setPlacement(null);
		setShiftX(0);
		if (refocus) triggerRef.current?.focus();
	}

	function selectOption(v: string) {
		onChange(v);
		setOpen(false);
		triggerRef.current?.focus();
	}

	function toggle() {
		if (open) closeList(false);
		else openList();
	}

	function handleKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				openList();
			}
			return;
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				e.stopPropagation();
				setActive((a) => (a + 1) % options.length);
				break;
			case "ArrowUp":
				e.preventDefault();
				e.stopPropagation();
				setActive((a) => (a - 1 + options.length) % options.length);
				break;
			case "Home":
				e.preventDefault();
				e.stopPropagation();
				setActive(0);
				break;
			case "End":
				e.preventDefault();
				e.stopPropagation();
				setActive(options.length - 1);
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				e.stopPropagation();
				selectOption(options[active].value);
				break;
			case "Escape":
				e.preventDefault();
				e.stopPropagation();
				closeList(false);
				break;
		}
	}

	// Keyboard is driven by a native listener so e.stopPropagation() keeps the
	// key (notably Escape) from bubbling up to the window-level handler of the
	// surrounding <Modal>, which would otherwise close the whole dialog. The
	// latest handler is read through a ref so the listener is attached once.
	const keyRef = useRef(handleKey);
	useEffect(() => {
		keyRef.current = handleKey;
	});
	useEffect(() => {
		const btn = triggerRef.current;
		if (!btn) return;
		const native = (e: KeyboardEvent) => keyRef.current(e);
		btn.addEventListener("keydown", native);
		return () => btn.removeEventListener("keydown", native);
	}, []);

	useEffect(() => {
		if (!open) return;
		function onDocMouseDown(e: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeList(false);
		}
		document.addEventListener("mousedown", onDocMouseDown);
		return () => document.removeEventListener("mousedown", onDocMouseDown);
	}, [open]);

	// Keep the active option visible by scrolling the list itself. Do NOT use
	// scrollIntoView here: it also scrolls ancestor containers (including
	// overflow-hidden ones), which shifted the whole app sideways whenever the
	// list overflowed the viewport.
	useEffect(() => {
		const list = listRef.current;
		if (!open || !list) return;
		const el = list.children[active] as HTMLElement | undefined;
		if (!el) return;
		const top = el.offsetTop;
		const bottom = top + el.offsetHeight;
		if (top < list.scrollTop) list.scrollTop = top;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
	}, [open, active]);

	// Keep the list horizontally inside the viewport. The list width depends on
	// its content (min-width: 100% up to 280px), so it is measured after render.
	// offsetLeft/offsetWidth ignore the list's own transform, which keeps this
	// idempotent if it re-runs once a shift is already applied.
	useLayoutEffect(() => {
		if (!open || !listRef.current || !rootRef.current) return;
		const naturalLeft = rootRef.current.getBoundingClientRect().left + listRef.current.offsetLeft;
		const width = listRef.current.offsetWidth;
		const innerW = window.innerWidth;
		// Hard clamp: stay fully inside the viewport whenever the list can fit;
		// soft clamp: prefer a small inset from both edges.
		let left: number;
		if (width <= innerW - 2 * GAP) left = Math.min(Math.max(naturalLeft, GAP), innerW - GAP - width);
		else if (width <= innerW) left = Math.min(Math.max(naturalLeft, 0), innerW - width);
		else left = 0;
		setShiftX(Math.round((left - naturalLeft) * 100) / 100);
	}, [open, placement, options.length]);

	useEffect(() => {
		if (!open) return;
		const onResize = () => {
			setPlacement(computePlacement());
			setShiftX(0);
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [open]);

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				type="button"
				ref={triggerRef}
				className={`select ${styles.trigger}`}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-activedescendant={open ? optionId(active) : undefined}
				aria-label={ariaLabel}
				title={title}
				onClick={toggle}
			>
				<span className={styles.value}>{currentLabel}</span>
				<span className={styles.caret} aria-hidden="true">
					▾
				</span>
			</button>
			{open && placement && (
				<div
					id={listboxId}
					ref={listRef}
					role="listbox"
					aria-label={ariaLabel ?? title}
					className={`${styles.list} ${placement.up ? styles.listUp : ""}`}
					style={{ maxHeight: placement.maxHeight, transform: shiftX ? `translateX(${shiftX}px)` : undefined }}
				>
					{options.map((o, i) => (
						<div
							key={o.value}
							id={optionId(i)}
							role="option"
							data-value={o.value}
							aria-selected={o.value === value}
							className={`${styles.option} ${i === active ? styles.optionActive : ""} ${
								o.value === value ? styles.optionSelected : ""
							}`}
							onClick={() => selectOption(o.value)}
							onMouseEnter={() => setActive(i)}
						>
							{o.label}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
