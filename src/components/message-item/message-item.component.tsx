import ReactMarkdown from "react-markdown";
import {
	useMessageParts,
	type FilePart,
	type Message,
	type Part,
	type TextPart,
} from "react-opencode";
import { ToolCard } from "../tool-card/tool-card.component.tsx";
import styles from "./message-item.module.scss";

const isText = (p: Part): p is TextPart => p.type === "text";
const isFile = (p: Part): p is FilePart => p.type === "file";

interface MessageItemProps {
	message: Message;
	streaming?: boolean;
}

export function MessageItem({ message, streaming = false }: MessageItemProps) {
	const parts = useMessageParts(message.id);

	if (message.role === "user") {
		return (
			<div className={styles.msg}>
				<div className={styles.role}>You</div>
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

	return (
		<div className={styles.msg}>
			<div className={styles.role}>
				{message.model ? `${message.model.providerID}/${message.model.id}` : "Assistant"}
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
					<ReactMarkdown>{part.text}</ReactMarkdown>
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
							<ReactMarkdown>{part.text}</ReactMarkdown>
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
						<ReactMarkdown>{part.text}</ReactMarkdown>
					</div>
				</details>
			);
		case "tool":
			return <ToolCard part={part} />;
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
