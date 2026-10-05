import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
	useMessageParts,
	type AssistantMessage,
	type FilePart,
	type Message,
	type Part,
	type SessionModelRef,
	type TextPart,
} from "react-opencode";
import { SubagentCard } from "../subagent-card/subagent-card.component.tsx";
import { ToolCard } from "../tool-card/tool-card.component.tsx";
import styles from "./message-item.module.scss";

const isText = (p: Part): p is TextPart => p.type === "text";
const isFile = (p: Part): p is FilePart => p.type === "file";

type AssistantModelCarrier = {
	model?: SessionModelRef;
	providerID?: string;
	modelID?: string;
};

function resolveModel(message: AssistantMessage): SessionModelRef | undefined {
	const carrier = message as AssistantMessage & AssistantModelCarrier;
	if (carrier.model) return carrier.model;
	if (carrier.providerID && carrier.modelID) {
		return { providerID: carrier.providerID, id: carrier.modelID };
	}
	return undefined;
}

// The router-cost plugin stamps the real upstream model onto the step's text or
// reasoning part (`metadata.router`); react-opencode's Part type doesn't model
// that field, so read it through a local shape.
type RouterStamp = {
	route?: string;
	model?: string;
	upstreamModel?: string;
};

function readRouterStamp(parts: Part[]): RouterStamp | undefined {
	for (const part of parts) {
		if (part.type !== "text" && part.type !== "reasoning") continue;
		const router = (part as { metadata?: { router?: RouterStamp } }).metadata?.router;
		if (router) return router;
	}
	return undefined;
}

interface MessageItemProps {
	message: Message;
	streaming?: boolean;
	/** Message sits at or after the session's revert point. */
	reverted?: boolean;
	/** Disable fork/revert while the session is busy or an action is in flight. */
	actionsDisabled?: boolean;
	onFork?: (message: Message) => void;
	onRevert?: (message: Message) => void;
}

function MessageActions({
	message,
	disabled,
	onFork,
	onRevert,
}: {
	message: Message;
	disabled?: boolean;
	onFork?: (message: Message) => void;
	onRevert?: (message: Message) => void;
}) {
	if (!onFork && !onRevert) return null;
	return (
		<div className={styles.actions}>
			{onFork && (
				<button
					type="button"
					className={styles.action}
					title="Fork to a new session from here"
					disabled={disabled}
					onClick={() => onFork(message)}
				>
					Fork
				</button>
			)}
			{onRevert && (
				<button
					type="button"
					className={styles.action}
					title="Revert to just before this message"
					disabled={disabled}
					onClick={() => onRevert(message)}
				>
					Revert
				</button>
			)}
		</div>
	);
}

export function MessageItem({
	message,
	streaming = false,
	reverted = false,
	actionsDisabled,
	onFork,
	onRevert,
}: MessageItemProps) {
	const parts = useMessageParts(message.id);

	if (message.role === "user") {
		return (
			<div className={`${styles.msg} ${reverted ? styles.reverted : ""}`}>
				<div className={styles.role}>
					<span>You</span>
					<MessageActions
						message={message}
						disabled={actionsDisabled}
						onFork={onFork}
						onRevert={onRevert}
					/>
				</div>
				<div className={styles.bubble}>
					{parts.filter(isText).map((p) => (
						<p key={p.id}>{p.text}</p>
					))}
					{parts.filter(isFile).map((p) => (
						<span key={p.id} className="chip">
							{p.filename ?? p.url}
						</span>
					))}
				</div>
			</div>
		);
	}

	const model = resolveModel(message);
	const router = readRouterStamp(parts);

	return (
		<div className={`${styles.msg} ${reverted ? styles.reverted : ""}`}>
			<div className={styles.role}>
				<span>{model ? `${model.providerID}/${model.id}` : "Assistant"}</span>
				{router?.upstreamModel && (
					<span
						className={`chip ${styles.upstream}`}
						title={router.route ? `route ${router.route}` : undefined}
					>
						{router.upstreamModel}
					</span>
				)}
			</div>
			<div className={styles.body}>
				{parts.map((part) => (
					<PartView key={part.id} part={part} />
				))}
				{streaming && <span className={styles.cursor} />}
				{message.error && (
					<div className={styles.error}>{message.error.data?.message ?? "Something went wrong"}</div>
				)}
			</div>
		</div>
	);
}

function PartView({ part }: { part: Part }) {
	switch (part.type) {
		case "text":
			return (
				<div className="md">
					<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{part.text}</ReactMarkdown>
				</div>
			);
		case "reasoning":
			// While the model is still producing this thought there is no
			// `time.end`, so render it live and expanded; once done, collapse it.
			if (part.time.end == null) {
				return (
					<div className={styles.reasoningLive}>
						<div className={styles.reasoningLiveHead}>
							<span className={styles.thinkingDot} />
							<span>Thinking…</span>
						</div>
						<div className={`md ${styles.reasoningMd}`}>
							<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{part.text}</ReactMarkdown>
						</div>
					</div>
				);
			}
			return (
				<details className={styles.reasoning}>
					<summary>
						Thought for {Math.max(1, Math.round((part.time.end - part.time.start) / 1000))}s
					</summary>
					<div className={`md ${styles.reasoningMd}`}>
						<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{part.text}</ReactMarkdown>
					</div>
				</details>
			);
		case "tool":
			return part.tool === "task" ? <SubagentCard part={part} /> : <ToolCard part={part} />;
		case "step-finish":
			return part.cost != null ? <div className={styles.stepCost}>${part.cost.toFixed(4)}</div> : null;
		case "patch":
			return (
				<div className="chip-row">
					{part.add.map((file) => (
						<span key={file} className="chip chip-add">
							+ {file}
						</span>
					))}
					{part.del.map((file) => (
						<span key={file} className="chip chip-del">
							− {file}
						</span>
					))}
				</div>
			);
		case "file":
			return <span className="chip">{part.filename ?? part.url}</span>;
		case "subtask":
			return <span className="chip">{part.description}</span>;
		case "agent":
			return <span className="chip">agent: {part.name}</span>;
		case "retry":
			return <div className={styles.error}>Retry: {part.error.data?.message ?? "error"}</div>;
		case "compaction":
			return (
				<div className="chip-row">
					<span className="chip">context compacted</span>
				</div>
			);
		default:
			return null;
	}
}
