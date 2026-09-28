import { useState } from "react";
import { useParams } from "react-router-dom";
import { useFileStatus, useSession, useSessionBusy, useTodos } from "react-opencode";
import { FileDiffPanel } from "../../components/file-diff-panel/file-diff-panel.component.tsx";
import { MessageList } from "../../components/message-list/message-list.component.tsx";
import { PermissionPrompts } from "../../components/permission-prompts/permission-prompts.component.tsx";
import { PromptComposer } from "../../components/prompt-composer/prompt-composer.component.tsx";
import { QuestionPrompts } from "../../components/question-prompts/question-prompts.component.tsx";
import { TodosPanel } from "../../components/todos-panel/todos-panel.component.tsx";
import styles from "./session-page.module.scss";

type Panel = "todos" | "files" | null;

export function SessionPage() {
	const { sessionId } = useParams<{ sessionId: string }>();
	const session = useSession(sessionId);
	const busy = useSessionBusy(sessionId);
	const todos = useTodos(sessionId);
	const fileStatus = useFileStatus();
	const [panel, setPanel] = useState<Panel>(null);

	if (!sessionId) return null;

	const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

	return (
		<div className={styles.session}>
			<header className={styles.header}>
				<h1 className={styles.title}>{session?.title ?? "Session"}</h1>
				<div className={styles.meta}>
					{session?.model && (
						<span className="chip">
							{session.model.providerID}/{session.model.id}
						</span>
					)}
					{session?.cost != null && <span className="chip">${session.cost.toFixed(4)}</span>}
				</div>
				<div className={styles.actions}>
					<button
						type="button"
						className={`btn ${panel === "todos" ? "btn-active" : ""}`}
						onClick={() => toggle("todos")}
					>
						Todos{todos.length > 0 ? ` (${todos.length})` : ""}
					</button>
					<button
						type="button"
						className={`btn ${panel === "files" ? "btn-active" : ""}`}
						onClick={() => toggle("files")}
					>
						Files{fileStatus.length > 0 ? ` (${fileStatus.length})` : ""}
					</button>
				</div>
			</header>
			<div className={styles.body}>
				<div className={styles.main}>
					<MessageList sessionId={sessionId} />
					<PermissionPrompts sessionId={sessionId} />
					<QuestionPrompts sessionId={sessionId} />
					<PromptComposer sessionId={sessionId} busy={busy} />
				</div>
				{panel === "todos" && <TodosPanel sessionId={sessionId} />}
				{panel === "files" && <FileDiffPanel sessionId={sessionId} />}
			</div>
		</div>
	);
}
