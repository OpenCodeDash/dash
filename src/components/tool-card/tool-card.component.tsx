import { useState, type ReactNode } from "react";
import type { ToolPart } from "react-opencode";
import { genericTitle } from "./views/types.ts";
import { GenericBody } from "./views/shared.tsx";
import { viewFor } from "./views/index.ts";
import styles from "./tool-card.module.scss";

const STATUS_ICON: Record<ToolPart["state"]["status"], string> = {
	pending: "…",
	running: "●",
	completed: "✓",
	error: "✕",
};

export function ToolCard({ part }: { part: ToolPart }) {
	const [open, setOpen] = useState(false);
	const state = part.state;
	const view = viewFor(part.tool);
	const summary: ReactNode = view?.summary?.(state) ?? genericTitle(state);

	return (
		<div className={styles.tool}>
			<button type="button" className={styles.head} onClick={() => setOpen((o) => !o)}>
				<span className={styles[`status_${state.status}`]}>{STATUS_ICON[state.status]}</span>
				<span className={styles.name}>{part.tool}</span>
				{summary && <span className={styles.title}>{summary}</span>}
				<span className={styles.chevron}>{open ? "−" : "+"}</span>
			</button>
			{open && (
				<div className={styles.body}>{view ? view.body(part) : <GenericBody state={state} />}</div>
			)}
		</div>
	);
}
