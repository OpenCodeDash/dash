import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
	useFileStatus,
	useOpenCode,
	useSession,
	useSessionBusy,
	useStore,
	useTodos,
	type Message,
} from "react-opencode";
import { useSessionTask } from "react-backdash";
import { ConfirmDialog } from "../../components/confirm-dialog/confirm-dialog.component.tsx";
import { FileDiffPanel } from "../../components/file-diff-panel/file-diff-panel.component.tsx";
import { MessageList } from "../../components/message-list/message-list.component.tsx";
import { PermissionPrompts } from "../../components/permission-prompts/permission-prompts.component.tsx";
import { PromptComposer } from "../../components/prompt-composer/prompt-composer.component.tsx";
import { QuestionPrompts } from "../../components/question-prompts/question-prompts.component.tsx";
import { TaskTodosPanel } from "../../components/task-todos-panel/task-todos-panel.component.tsx";
import { TodosPanel } from "../../components/todos-panel/todos-panel.component.tsx";
import { forkSessionFromMessage, restoreSession, revertSessionToMessage } from "../../server.ts";
import styles from "./session-page.module.scss";

type Panel = "todos" | "files" | null;
type Action = "fork" | "revert" | "restore";

// Stable empty reference so the store selector doesn't churn on every render.
const EMPTY_MESSAGES: Message[] = [];

export function SessionPage() {
	const { sessionId } = useParams<{ sessionId: string }>();
	const navigate = useNavigate();
	const client = useOpenCode();
	const session = useSession(sessionId);
	const busy = useSessionBusy(sessionId);
	const todos = useTodos(sessionId);
	// If this session is linked to a kanban task (it claimed one, or set its
	// todos), the panel shows that task's checklist instead of the session's
	// own. Re-resolved whenever the session goes busy/idle so a mid-session
	// claim is picked up.
	const linked = useSessionTask(sessionId, busy);
	const todoCount = linked ? (linked.task.todos ?? []).length : todos.length;
	const fileStatus = useFileStatus();
	const [panel, setPanel] = useState<Panel>(null);
	const [action, setAction] = useState<Action | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [revertTarget, setRevertTarget] = useState<Message | null>(null);
	const storeMessages = useStore((s) => (sessionId ? (s.messages[sessionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES));

	const isSubagent = Boolean(session?.parentID);
	const parent = useSession(session?.parentID);

	const revertMessageID = session?.revert?.messageID;
	const rolledBackCount = useMemo(() => {
		if (!revertMessageID) return 0;
		const at = storeMessages.findIndex((m) => m.id === revertMessageID);
		return at < 0 ? 0 : storeMessages.length - at;
	}, [storeMessages, revertMessageID]);

	const handleFork = useCallback(
		async (message: Message) => {
			if (!sessionId || action) return;
			setAction("fork");
			setActionError(null);
			try {
				const forked = await forkSessionFromMessage(
					client.url,
					sessionId,
					message.id,
					session?.directory,
				);
				client.store.upsertSession(forked);
				// API-created sessions don't reliably emit session.created, so
				// refresh the list to make the fork appear in the sidebar.
				client
					.listSessions()
					.then((list) => client.store.setSessions(list))
					.catch(() => undefined);
				navigate(`/session/${forked.id}`);
			} catch (e) {
				setActionError(e instanceof Error ? e.message : String(e));
			} finally {
				setAction(null);
			}
		},
		[action, client, navigate, session, sessionId],
	);

	const handleRestore = useCallback(async () => {
		if (!sessionId || action) return;
		setAction("restore");
		setActionError(null);
		try {
			const updated = await restoreSession(client.url, sessionId, session?.directory);
			client.store.upsertSession(updated);
		} catch (e) {
			setActionError(e instanceof Error ? e.message : String(e));
		} finally {
			setAction(null);
		}
	}, [action, client, session, sessionId]);

	function confirmRevert() {
		const target = revertTarget;
		setRevertTarget(null);
		if (!target || !sessionId || action) return;
		setAction("revert");
		setActionError(null);
		revertSessionToMessage(client.url, sessionId, target.id, session?.directory)
			.then((updated) => client.store.upsertSession(updated))
			.catch((e) => setActionError(e instanceof Error ? e.message : String(e)))
			.finally(() => setAction(null));
	}

	if (!sessionId) return null;

	const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
	const actionsDisabled = busy || action != null;

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
					<MessageList
						key={sessionId}
						sessionId={sessionId}
						revertMessageID={revertMessageID}
						actionsDisabled={actionsDisabled}
						onFork={isSubagent ? undefined : handleFork}
						onRevert={isSubagent ? undefined : setRevertTarget}
					/>
					{!isSubagent && rolledBackCount > 0 && (
						<div className={styles.revertDock}>
							<span className={styles.revertText}>
								{rolledBackCount} rolled back message{rolledBackCount === 1 ? "" : "s"}
							</span>
							<button
								type="button"
								className="btn btn-ghost"
								disabled={actionsDisabled}
								onClick={handleRestore}
							>
								{action === "restore" ? "Restoring…" : "Restore"}
							</button>
						</div>
					)}
					{actionError && <div className={styles.actionError}>{actionError}</div>}
					{!isSubagent && (
						<>
							<PermissionPrompts sessionId={sessionId} />
							<QuestionPrompts sessionId={sessionId} />
							<PromptComposer key={sessionId} sessionId={sessionId} busy={busy} />
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
			<ConfirmDialog
				open={revertTarget != null}
				title="Revert to this message"
				message="This rolls back this message and everything after it, and restores files to their state at that point. You can restore the messages afterwards."
				confirmLabel="Revert"
				danger
				onConfirm={confirmRevert}
				onCancel={() => setRevertTarget(null)}
			/>
		</div>
	);
}
