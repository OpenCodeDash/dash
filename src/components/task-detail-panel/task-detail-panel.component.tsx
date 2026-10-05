import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useBoard, useClientActions, type Task } from "react-backdash";
import {
	useMessageParts,
	useMessages,
	useSession,
	useSessionBusy,
	type Message,
	type TextPart,
} from "react-opencode";
import { TaskTodosPanel } from "../task-todos-panel/task-todos-panel.component.tsx";
import styles from "./task-detail-panel.module.scss";

function formatDue(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Collapse a message's text parts into a single one-line preview.
function snippet(parts: TextPart[]): string {
	const text = parts
		.map((p) => p.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;
}

function MessageSnippet({ message }: { message: Message }) {
	const parts = useMessageParts(message.id);
	const text = snippet(parts.filter((p): p is TextPart => p.type === "text"));
	if (!text) return null;
	const role =
		message.role === "user"
			? "You"
			: message.model
				? `${message.model.providerID}/${message.model.id}`
				: "Assistant";
	return (
		<div className={styles.msg}>
			<div className={styles.msgRole}>{role}</div>
			<div className={styles.msgText}>{text}</div>
		</div>
	);
}

// The session that claimed this task: its title, a peek at its latest messages,
// and a link into the full session view.
function SessionPreview({ sessionId }: { sessionId: string }) {
	const session = useSession(sessionId);
	const messages = useMessages(sessionId) ?? [];
	const busy = useSessionBusy(sessionId);
	const recent = messages.slice(-3);

	return (
		<section className={styles.section}>
			<div className={styles.sectionHead}>
				<h3 className={styles.label}>Session</h3>
				{busy && <span className={styles.statusPill}>working…</span>}
			</div>
			<div className={styles.sessionTitle}>{session?.title ?? "Session"}</div>
			{recent.length === 0 ? (
				<p className={styles.muted}>No messages yet.</p>
			) : (
				<div className={styles.msgs}>
					{recent.map((message) => (
						<MessageSnippet key={message.id} message={message} />
					))}
				</div>
			)}
			<Link to={`/session/${sessionId}`} className={`btn btn-ghost ${styles.openSession}`}>
				Open session →
			</Link>
		</section>
	);
}

interface TaskDetailPanelProps {
	boardId: string;
	task: Task;
	/** Whether the task's column is a queue (i.e. it can be claimed). */
	isQueue: boolean;
	onClose: () => void;
	onEdit: () => void;
}

// Read-only detail view for a task: description, metadata and a peek at the
// claiming session. The checklist is the one editable part (writing straight
// back to the board); everything else is changed through the Edit modal, which
// the Edit button opens. Deliberately non-modal, so clicking another task
// swaps the panel's contents.
export function TaskDetailPanel({ boardId, task, isQueue, onClose, onEdit }: TaskDetailPanelProps) {
	const { claimTask, releaseTask } = useClientActions();
	const board = useBoard(boardId);

	// Names for the dependency id lists, resolved board-wide.
	const taskNameById = useMemo(() => {
		const map = new Map<number, string>();
		board?.columns.forEach((c) => c.tasks.forEach((t) => map.set(t.id, t.name)));
		return map;
	}, [board]);

	const dependsOn = (task.dependsOn ?? []).map((id) => taskNameById.get(id) ?? `#${id}`);
	const dependents = (task.dependents ?? []).map((id) => taskNameById.get(id) ?? `#${id}`);
	const tags = task.tags ?? [];
	const hasDetails =
		task.priority !== null ||
		task.estimate !== null ||
		task.assignee !== null ||
		task.dueAt !== null ||
		tags.length > 0 ||
		dependsOn.length > 0 ||
		dependents.length > 0;

	return createPortal(
		<aside className={styles.panel} role="dialog" aria-label={`Details for ${task.name}`}>
			<header className={styles.head}>
				<div className={styles.headMain}>
					<div className={styles.titleRow}>
						<span className={styles.taskNumber}>#{task.id}</span>
						<h2 className={styles.title}>{task.name}</h2>
					</div>
					{task.claimedBy && (
						<span className={styles.claimedBy}>
							claimed by <strong>{task.claimedBy}</strong>
						</span>
					)}
				</div>
				<div className={styles.headActions}>
					<button type="button" className="btn btn-ghost" title="Edit task" onClick={onEdit}>
						Edit
					</button>
					<button
						type="button"
						className="icon-btn"
						title="Close"
						aria-label="Close"
						onClick={onClose}
					>
						✕
					</button>
				</div>
			</header>

			<div className={styles.body}>
				{(task.claimedBy || isQueue) && (
					<div className={styles.actions}>
						{task.claimedBy ? (
							<button
								type="button"
								className="btn btn-danger"
								title="Release the task"
								onClick={() =>
									void releaseTask(boardId, task.columnId, task.id).catch(() => undefined)
								}
							>
								Release claim
							</button>
						) : (
							<button
								type="button"
								className="btn btn-primary"
								title="Claim the task"
								onClick={() =>
									void claimTask(boardId, task.columnId, task.id).catch(() => undefined)
								}
							>
								Claim task
							</button>
						)}
					</div>
				)}

				{task.description && (
					<section className={styles.section}>
						<h3 className={styles.label}>Description</h3>
						<div className={styles.desc}>{task.description}</div>
					</section>
				)}

				{hasDetails && (
					<section className={styles.section}>
						<h3 className={styles.label}>Details</h3>
						<dl className={styles.details}>
							{task.priority && (
								<div className={styles.detailRow}>
									<dt>Priority</dt>
									<dd>
										<span className={`${styles.prio} ${styles[`prio_${task.priority}`]}`}>
											{task.priority}
										</span>
									</dd>
								</div>
							)}
							{task.estimate !== null && (
								<div className={styles.detailRow}>
									<dt>Estimate</dt>
									<dd>{task.estimate} pts</dd>
								</div>
							)}
							{task.assignee && (
								<div className={styles.detailRow}>
									<dt>Assignee</dt>
									<dd>@{task.assignee}</dd>
								</div>
							)}
							{task.dueAt && (
								<div className={styles.detailRow}>
									<dt>Due</dt>
									<dd>{formatDue(task.dueAt)}</dd>
								</div>
							)}
							{tags.length > 0 && (
								<div className={styles.detailRow}>
									<dt>Tags</dt>
									<dd className={styles.tagWrap}>
										{tags.map((tag) => (
											<span
												key={tag.id}
												className={`${styles.tag} ${tag.color ? styles.tagColored : ""}`}
												style={
													tag.color
														? { borderColor: tag.color, color: tag.color }
														: undefined
												}
											>
												{tag.name}
											</span>
										))}
									</dd>
								</div>
							)}
							{dependsOn.length > 0 && (
								<div className={styles.detailRow}>
									<dt>Depends on</dt>
									<dd>{dependsOn.join(", ")}</dd>
								</div>
							)}
							{dependents.length > 0 && (
								<div className={styles.detailRow}>
									<dt>Blocks</dt>
									<dd>{dependents.join(", ")}</dd>
								</div>
							)}
						</dl>
					</section>
				)}

				{task.sessionId && <SessionPreview sessionId={task.sessionId} />}

				<section className={styles.section}>
					<h3 className={styles.label}>Todos</h3>
					<TaskTodosPanel boardId={boardId} task={task} variant="inline" />
				</section>
			</div>
		</aside>,
		document.body,
	);
}
