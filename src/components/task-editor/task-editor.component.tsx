import { useState } from "react";
import { useClientActions, useTags, type Task, type TaskPriority } from "react-backdash";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./task-editor.module.scss";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

// ISO -> the value a <input type="datetime-local"> expects, in local time
function toLocalInput(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours()
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
	const [name, setName] = useState(task.name);
	const [description, setDescription] = useState(task.description ?? "");
	const [priority, setPriority] = useState<TaskPriority | "">(task.priority ?? "");
	const [estimate, setEstimate] = useState(task.estimate === null ? "" : String(task.estimate));
	const [assignee, setAssignee] = useState(task.assignee ?? "");
	const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt));
	const [tagIds, setTagIds] = useState<number[]>(task.tags.map((t) => t.id));

	function toggleTag(id: number) {
		setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	}

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
			</form>
		</Modal>
	);
}
