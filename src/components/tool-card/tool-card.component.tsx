import { useState } from "react";
import type { ToolPart } from "react-opencode";
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
	const title =
		state.status === "completed"
			? state.title
			: state.status === "running"
				? (state.title ?? "")
				: "";

	return (
		<div className={styles.tool}>
			<button type="button" className={styles.head} onClick={() => setOpen((o) => !o)}>
				<span className={styles[`status_${state.status}`]}>{STATUS_ICON[state.status]}</span>
				<span className={styles.name}>{part.tool}</span>
				{title && <span className={styles.title}>{title}</span>}
				<span className={styles.chevron}>{open ? "−" : "+"}</span>
			</button>
			{open && (
				<div className={styles.body}>
					{state.input && <pre className={styles.pre}>{JSON.stringify(state.input, null, 2)}</pre>}
					{state.status === "completed" && <pre className={styles.pre}>{state.output}</pre>}
					{state.status === "error" && (
						<pre className={`${styles.pre} ${styles.preError}`}>{state.error}</pre>
					)}
				</div>
			)}
		</div>
	);
}
