import { useState } from "react";
import {
	useBoard,
	useClientActions,
	useTags,
	type Task,
	type TaskPriority,
	type TaskTodo,
	type TaskTodoStatus,
} from "react-backdash";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./task-editor.module.scss";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

// Clicking a status advances it in this cycle: pending → in progress → done.
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

// ISO -> the value a <input type="datetime-local"> expects, in local time
function toLocalInput(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours(),
	)}:${pad(date.getMinutes())}`;
}

// datetime-local value -> ISO (or null when cleared)
function fromLocalInput(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface TaskEditorProps {
	boardId: string;
	task: Task;
	open: boolean;
	onClose: () => void;
}

export function TaskEditor({ boardId, task, open, onClose }: TaskEditorProps) {
	const { updateTask } = useClientActions();
	const tags = useTags(boardId);
	const board = useBoard(boardId);
	const [name, setName] = useState(task.name);
	const [description, setDescription] = useState(task.description ?? "");
	const [priority, setPriority] = useState<TaskPriority | "">(task.priority ?? "");
	const [estimate, setEstimate] = useState(task.estimate === null ? "" : String(task.estimate));
	const [assignee, setAssignee] = useState(task.assignee ?? "");
	const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt));
	const [tagIds, setTagIds] = useState<number[]>((task.tags ?? []).map((t) => t.id));
	const [dependsOn, setDependsOn] = useState<number[]>(task.dependsOn ?? []);
	const [depQuery, setDepQuery] = useState("");
	const [todos, setTodos] = useState<TaskTodo[]>(task.todos ?? []);
	const [newTodo, setNewTodo] = useState("");
	const [editingTodo, setEditingTodo] = useState<number | null>(null);
	const [todoDraft, setTodoDraft] = useState("");

	function toggleTag(id: number) {
		setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	}

	function toggleDep(id: number) {
		setDependsOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	}

	function cycleStatus(index: number) {
		setTodos((prev) =>
			prev.map((t, i) => (i === index ? { ...t, status: NEXT_STATUS[t.status] } : t)),
		);
	}

	function addTodo(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = newTodo.trim();
		if (!trimmed) return;
		setTodos((prev) => [...prev, { content: trimmed, status: "pending" }]);
		setNewTodo("");
	}

	function removeTodo(index: number) {
		setTodos((prev) => prev.filter((_, i) => i !== index));
	}

	function startEditTodo(index: number) {
		setEditingTodo(index);
		setTodoDraft(todos[index].content);
	}

	function commitEditTodo() {
		if (editingTodo === null) return;
		const trimmed = todoDraft.trim();
		if (trimmed) {
			setTodos((prev) => prev.map((t, i) => (i === editingTodo ? { ...t, content: trimmed } : t)));
		}
		setEditingTodo(null);
	}

	// Every other task on the board, as a dependency candidate (labelled with
	// its column so a same-named task is unambiguous)
	const depCandidates = (board?.columns ?? [])
		.flatMap((column) => column.tasks.map((t) => ({ id: t.id, name: t.name, column: column.name })))
		.filter((c) => c.id !== task.id);

	const depSelected = depCandidates.filter((c) => dependsOn.includes(c.id));
	const depFiltered = depQuery.trim()
		? depCandidates.filter((c) => c.name.toLowerCase().includes(depQuery.trim().toLowerCase()))
		: depCandidates;

	function submit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		void updateTask(boardId, task.columnId, task.id, {
			name: trimmed,
			description,
			priority: priority === "" ? null : priority,
			estimate: estimate.trim() === "" ? null : Number(estimate),
			assignee: assignee.trim() || null,
			dueAt: fromLocalInput(dueAt),
			tagIds,
			dependsOn,
			todos,
		})
			.then(onClose)
			.catch(() => undefined);
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Edit task"
			maxWidth={560}
			footer={
				<>
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						form="task-editor-form"
						className="btn btn-primary"
						disabled={!name.trim()}
					>
						Save
					</button>
				</>
			}
		>
			<form id="task-editor-form" className={styles.form} onSubmit={submit}>
				<label className={styles.field}>
					<span className={styles.label}>Name</span>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
						aria-label="Task name"
					/>
				</label>

				<label className={styles.field}>
					<span className={styles.label}>Description</span>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={4}
						placeholder="Prompt text the task carries"
						aria-label="Task description"
					/>
				</label>

				<div className={styles.field}>
					<span className={styles.label}>
						Todos
						{todos.length > 0 && (
							<em className={styles.todoCount}>
								{todos.filter((t) => t.status === "completed").length}/{todos.length}
							</em>
						)}
					</span>
					{todos.length > 0 && (
						<ul className={styles.todoList}>
							{todos.map((todo, i) => (
								<li key={i} className={`${styles.todo} ${styles[`todo_${todo.status}`]}`}>
									<button
										type="button"
										className={styles.todoStatus}
										aria-label={`${STATUS_LABEL[todo.status]}`}
										title={STATUS_LABEL[todo.status]}
										onClick={() => cycleStatus(i)}
									>
										{STATUS_ICON[todo.status]}
									</button>
									{editingTodo === i ? (
										<input
											className={styles.todoInput}
											value={todoDraft}
											autoFocus
											draggable={false}
											aria-label="Edit todo"
											onChange={(e) => setTodoDraft(e.target.value)}
											onBlur={commitEditTodo}
											onKeyDown={(e) => {
												if (e.key === "Enter") commitEditTodo();
												if (e.key === "Escape") setEditingTodo(null);
											}}
										/>
									) : (
										<span
											className={styles.todoContent}
											title="Double-click to edit"
											onDoubleClick={() => startEditTodo(i)}
										>
											{todo.content}
										</span>
									)}
									<button
										type="button"
										className="icon-btn"
										aria-label="Remove todo"
										onClick={() => removeTodo(i)}
									>
										✕
									</button>
								</li>
							))}
						</ul>
					)}
					<form className={styles.todoAdd} onSubmit={addTodo}>
						<input
							value={newTodo}
							onChange={(e) => setNewTodo(e.target.value)}
							placeholder={todos.length === 0 ? "Add a checklist item…" : "Add todo…"}
							aria-label="New todo"
						/>
						<button type="submit" className="btn btn-primary" disabled={!newTodo.trim()}>
							Add
						</button>
					</form>
				</div>

				<div className={styles.grid}>
					<label className={styles.field}>
						<span className={styles.label}>Priority</span>
						<select
							value={priority}
							onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
							aria-label="Task priority"
						>
							<option value="">None</option>
							{PRIORITIES.map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>
					</label>

					<label className={styles.field}>
						<span className={styles.label}>Estimate</span>
						<input
							type="number"
							min={0}
							value={estimate}
							onChange={(e) => setEstimate(e.target.value)}
							placeholder="points"
							aria-label="Task estimate"
						/>
					</label>

					<label className={styles.field}>
						<span className={styles.label}>Assignee</span>
						<input
							value={assignee}
							onChange={(e) => setAssignee(e.target.value)}
							placeholder="alice"
							aria-label="Task assignee"
						/>
					</label>

					<label className={styles.field}>
						<span className={styles.label}>Due</span>
						<input
							type="datetime-local"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
							aria-label="Task due date"
						/>
					</label>
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Tags</span>
					{tags.length === 0 ? (
						<p className={styles.hint}>
							No tags yet — create some with the <strong>Tags</strong> button.
						</p>
					) : (
						<div className={styles.tags}>
							{tags.map((tag) => {
								const active = tagIds.includes(tag.id);
								return (
									<button
										key={tag.id}
										type="button"
										className={`${styles.tagToggle} ${active ? styles.tagOn : ""}`}
										aria-pressed={active}
										onClick={() => toggleTag(tag.id)}
									>
										<span
											className={styles.swatch}
											style={tag.color ? { background: tag.color } : undefined}
										/>
										{tag.name}
									</button>
								);
							})}
						</div>
					)}
				</div>
				<div className={styles.field}>
					<span className={styles.label}>Depends on</span>
					{depCandidates.length === 0 ? (
						<p className={styles.hint}>No other tasks to depend on yet.</p>
					) : (
						<>
							{depSelected.length > 0 && (
								<div className={styles.depChips}>
									{depSelected.map((c) => (
										<span
											key={c.id}
											className={styles.depChip}
											data-dep-chip={c.id}
											title={`in ${c.column}`}
										>
											{c.name}
											<button
												type="button"
												className={styles.depRemove}
												aria-label={`Remove dependency ${c.name}`}
												onClick={() => toggleDep(c.id)}
											>
												×
											</button>
										</span>
									))}
								</div>
							)}
							<input
								className={styles.depSearch}
								value={depQuery}
								onChange={(e) => setDepQuery(e.target.value)}
								placeholder="Search tasks…"
								aria-label="Search dependency tasks"
							/>
							<div className={styles.depList}>
								{depFiltered.length === 0 ? (
									<p className={styles.hint}>No tasks match “{depQuery}”.</p>
								) : (
									depFiltered.map((c) => {
										const active = dependsOn.includes(c.id);
										return (
											<button
												key={c.id}
												type="button"
												className={`${styles.depRow} ${active ? styles.depRowOn : ""}`}
												data-dep-candidate={c.id}
												aria-pressed={active}
												onClick={() => toggleDep(c.id)}
											>
												<span className={styles.depCheck} aria-hidden="true">
													{active ? "✓" : ""}
												</span>
												<span className={styles.depRowName}>{c.name}</span>
												<span className={styles.depRowCol}>{c.column}</span>
											</button>
										);
									})
								)}
							</div>
						</>
					)}
				</div>
			</form>
		</Modal>
	);
}
