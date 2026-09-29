import { useNavigate } from "react-router-dom";
import { useSession, useSessionBusy, type ToolPart } from "react-opencode";
import styles from "./subagent-card.module.scss";

const STATUS_ICON: Record<ToolPart["state"]["status"], string> = {
	pending: "…",
	running: "●",
	completed: "✓",
	error: "✕",
};

function readMetadata(state: ToolPart["state"]): Record<string, unknown> | undefined {
	// The server attaches metadata (incl. the child sessionId) to a task part as
	// soon as the child session exists — including the error state, where the
	// subagent's own LLM call fails after the child was created. The TS union only
	// declares metadata on running/completed, so read it loosely.
	return (state as { metadata?: Record<string, unknown> }).metadata;
}

function asString(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

export function SubagentCard({ part }: { part: ToolPart }) {
	const navigate = useNavigate();
	const state = part.state;
	const metadata = readMetadata(state);
	const sessionId = asString(metadata?.sessionId);
	const description = asString(state.input?.description);
	const subagentType = asString(state.input?.subagent_type);
	const model = asString(metadata?.model);

	const busy = useSessionBusy(sessionId);
	const child = useSession(sessionId);

	const status = busy ? "running" : state.status;
	const clickable = Boolean(sessionId);
	const label = description ?? subagentType ?? "subagent";
	const modelLabel = model ?? (child?.model ? `${child.model.providerID}/${child.model.id}` : undefined);
	const cost = child?.cost ?? 0;

	return (
		<div className={styles.card}>
			<button
				type="button"
				className={styles.head}
				disabled={!clickable}
				title={clickable ? "View subagent session" : "Starting…"}
				onClick={() => sessionId && navigate(`/session/${sessionId}`)}
			>
				<span className={styles[`status_${status}`]}>{STATUS_ICON[status]}</span>
				<span className={styles.badge}>subagent</span>
				{subagentType && <span className="chip">{subagentType}</span>}
				<span className={styles.label}>{label}</span>
				<span className={styles.chevron}>{clickable ? "↗" : "…"}</span>
			</button>
			{(modelLabel || cost > 0) && (
				<div className={styles.meta}>
					{modelLabel && <span className="chip">{modelLabel}</span>}
					{cost > 0 && <span className="chip">${cost.toFixed(4)}</span>}
				</div>
			)}
		</div>
	);
}
