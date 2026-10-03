import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFileStatus, useSession, useSessionBusy, useTodos } from "react-opencode";
import { useSessionTask } from "react-backdash";
import { FileDiffPanel } from "../../components/file-diff-panel/file-diff-panel.component.tsx";
import { MessageList } from "../../components/message-list/message-list.component.tsx";
import { PermissionPrompts } from "../../components/permission-prompts/permission-prompts.component.tsx";
import { PromptComposer } from "../../components/prompt-composer/prompt-composer.component.tsx";
import { QuestionPrompts } from "../../components/question-prompts/question-prompts.component.tsx";
import { TaskTodosPanel } from "../../components/task-todos-panel/task-todos-panel.component.tsx";
import { TodosPanel } from "../../components/todos-panel/todos-panel.component.tsx";
import styles from "./session-page.module.scss";

type Panel = "todos" | "files" | null;

export function SessionPage() {
	const { sessionId } = useParams<{ sessionId: string }>();
	const session = useSession(sessionId);
	const busy = useSessionBusy(sessionId);
	const todos = useTodos(sessionId);
	// If this session is linked to a kanban task (it claimed one, or set its
	// todos), the panel shows that task's checklist instead of the session's
	// own. Re-resolved whenever the session goes busy/idle so a mid-session
	// claim is picked up.
	const linked = useSessionTask(sessionId, busy);
	const todoCount = linked ? linked.task.todos.length : todos.length;
	const fileStatus = useFileStatus();
	const [panel, setPanel] = useState<Panel>(null);

	const isSubagent = Boolean(session?.parentID);
	const parent = useSession(session?.parentID);

	if (!sessionId) return null;

	const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

	return (
		<div className={styles.session}>
			{isSubagent && session && (
				<div className={styles.breadcrumb}>
					<Link to={`/session/${session.parentID}`} className={styles.breadcrumbLink}>
						← {parent?.title ?? "Parent session"}
					</Link>
					<span className="chip chip-subagent">subagent</span>
					<span className={styles.breadcrumbHint}>read-only</span>
				</div>
			)}
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
						Todos{todoCount > 0 ? ` (${todoCount})` : ""}
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
					<MessageList key={sessionId} sessionId={sessionId} />
					{!isSubagent && (
						<>
							<PermissionPrompts sessionId={sessionId} />
							<QuestionPrompts sessionId={sessionId} />
							<PromptComposer sessionId={sessionId} busy={busy} />
						</>
					)}
				</div>
				{panel === "todos" &&
					(linked ? (
						<TaskTodosPanel boardId={linked.boardId} task={linked.task} />
					) : (
						<TodosPanel sessionId={sessionId} />
					))}
				{panel === "files" && <FileDiffPanel sessionId={sessionId} />}
			</div>
		</div>
	);
}
