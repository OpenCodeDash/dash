import { useState } from "react";
import type { ToolPart } from "react-opencode";

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
		<div className={`tool tool-${state.status}`}>
			<button type="button" className="tool-head" onClick={() => setOpen((o) => !o)}>
				<span className={`tool-status tool-status-${state.status}`}>
					{STATUS_ICON[state.status]}
				</span>
				<span className="tool-name">{part.tool}</span>
				{title && <span className="tool-title">{title}</span>}
				<span className="tool-chevron">{open ? "−" : "+"}</span>
			</button>
			{open && (
				<div className="tool-body">
					{state.input && <pre className="tool-pre">{JSON.stringify(state.input, null, 2)}</pre>}
					{state.status === "completed" && <pre className="tool-pre">{state.output}</pre>}
					{state.status === "error" && <pre className="tool-pre tool-pre-error">{state.error}</pre>}
				</div>
			)}
		</div>
	);
}
