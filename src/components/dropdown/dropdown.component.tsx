import { useEffect, useId, useRef, useState } from "react";
import styles from "./dropdown.module.scss";

export interface DropdownOption {
	value: string;
	label: string;
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
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const uid = useId();

	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-opt-${i}`;
	const selected = options.find((o) => o.value === value);
	const currentLabel = selected?.label ?? "";

	function openList() {
		const idx = options.findIndex((o) => o.value === value);
		setActive(idx >= 0 ? idx : 0);
		setOpen(true);
	}

	function closeList(refocus: boolean) {
		setOpen(false);
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

	useEffect(() => {
		if (!open || !listRef.current) return;
		(listRef.current.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
	}, [open, active]);

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
			{open && (
				<div
					id={listboxId}
					ref={listRef}
					role="listbox"
					aria-label={ariaLabel ?? title}
					className={styles.list}
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
