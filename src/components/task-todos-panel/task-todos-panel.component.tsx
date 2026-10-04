import { useState } from "react";
import {
	useClientActions,
	type Task,
	type TaskTodo,
	type TaskTodoStatus,
} from "react-backdash";
import styles from "./task-todos-panel.module.scss";

// Clicking a status advances it: pending → in progress → done.
const NEXT_STATUS: Record<TaskTodoStatus, TaskTodoStatus> = {
	pending: "in_progress",
	in_progress: "completed",
	completed: "pending",
};

const STATUS_LABEL: Record<TaskTodoStatus, string> = {
	pending: "Pending — click to mark in progress",
	in_progress: "In progress — click to mark done",
	completed: "Done — click to reopen",
};

const STATUS_ICON: Record<TaskTodoStatus, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
};

// The checklist of the kanban task the session is working on. Shown in place of
// the session's own todos, and editable (writes straight back to the board).
// `inline` drops the side-panel shell so it can be embedded in another
// container (e.g. the task detail drawer); the default keeps the standalone
// panel used by the session page.
export function TaskTodosPanel({
	boardId,
	task,
	variant = "panel",
}: {
	boardId: string;
	task: Task;
	variant?: "panel" | "inline";
}) {
	const { updateTask } = useClientActions();
	const [newTodo, setNewTodo] = useState("");
	const [editing, setEditing] = useState<number | null>(null);
	const [draft, setDraft] = useState("");

	// Read the live task (kept current by the store); each edit replaces the
	// whole checklist, matching the API contract.
	const todos = task.todos ?? [];
	const done = todos.filter((t) => t.status === "completed").length;

	function save(next: TaskTodo[]) {
		void updateTask(boardId, task.columnId, task.id, { todos: next }).catch(() => undefined);
	}

	function cycle(index: number) {
		save(todos.map((t, i) => (i === index ? { ...t, status: NEXT_STATUS[t.status] } : t)));
	}

	function remove(index: number) {
		save(todos.filter((_, i) => i !== index));
	}

	function add(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = newTodo.trim();
		if (!trimmed) return;
		save([...todos, { content: trimmed, status: "pending" }]);
		setNewTodo("");
	}

	function startEdit(index: number) {
		setEditing(index);
		setDraft(todos[index].content);
	}

	function commitEdit() {
		if (editing === null) return;
		const trimmed = draft.trim();
		if (trimmed) {
			save(todos.map((t, i) => (i === editing ? { ...t, content: trimmed } : t)));
		}
		setEditing(null);
	}

	const body = (
		<div className={variant === "inline" ? styles.inline : "panel-body"}>
			{todos.length === 0 ? (
				<p className="panel-empty">No todos yet.</p>
			) : (
				<ul className={styles.list}>
					{todos.map((todo, i) => (
						<li key={i} className={`${styles.todo} ${styles[todo.status]}`}>
							<button
								type="button"
								className={styles.status}
								aria-label={STATUS_LABEL[todo.status]}
								title={STATUS_LABEL[todo.status]}
								onClick={() => cycle(i)}
							>
								{STATUS_ICON[todo.status]}
							</button>
							{editing === i ? (
								<input
									className={styles.input}
									value={draft}
									autoFocus
									aria-label="Edit todo"
									onChange={(e) => setDraft(e.target.value)}
									onBlur={commitEdit}
									onKeyDown={(e) => {
										if (e.key === "Enter") commitEdit();
										if (e.key === "Escape") setEditing(null);
									}}
								/>
							) : (
								<span
									className={styles.content}
									title="Double-click to edit"
									onDoubleClick={() => startEdit(i)}
								>
									{todo.content}
								</span>
							)}
							<button
								type="button"
								className="icon-btn"
								aria-label="Remove todo"
								onClick={() => remove(i)}
							>
								✕
							</button>
						</li>
					))}
				</ul>
			)}
			<form className={styles.add} onSubmit={add}>
				<input
					value={newTodo}
					onChange={(e) => setNewTodo(e.target.value)}
					placeholder="Add todo…"
					aria-label="New todo"
				/>
				<button type="submit" className="btn btn-primary" disabled={!newTodo.trim()}>
					Add
				</button>
			</form>
		</div>
	);

	if (variant === "inline") return body;

	return (
		<aside className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Todos</h2>
				{todos.length > 0 && (
					<span className={styles.count}>
						{done}/{todos.length}
					</span>
				)}
			</div>
			{body}
		</aside>
	);
}
