import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
	BackdashError,
	useBackdash,
	useBoard,
	useClientActions,
	type Column,
	type Task,
} from "react-backdash";
import { ConfirmDialog } from "../../components/confirm-dialog/confirm-dialog.component.tsx";
import { TagManager } from "../../components/tag-manager/tag-manager.component.tsx";
import { TaskEditor } from "../../components/task-editor/task-editor.component.tsx";
import styles from "./board-page.module.scss";

type DragState =
	| { kind: "column"; id: number }
	| { kind: "task"; id: number; fromColumnId: number }
	| null;

function formatDue(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TaskCard({
	task,
	column,
	boardId,
	isDragSource,
	onDragStartTask,
	onDropOnTask,
	onDragEnd,
	onEdit,
}: {
	task: Task;
	column: Column;
	boardId: string;
	isDragSource: boolean;
	onDragStartTask: (task: Task, columnId: number) => void;
	onDropOnTask: (taskId: number, columnId: number) => void;
	onDragEnd: () => void;
	onEdit: (task: Task) => void;
}) {
	const { updateTask, deleteTask, claimTask, releaseTask } = useClientActions();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");

	const hasBadges =
		task.priority !== null ||
		task.tags.length > 0 ||
		task.assignee !== null ||
		task.estimate !== null ||
		task.dueAt !== null;

	function commitRename() {
		setRenaming(false);
		const trimmed = title.trim();
		if (trimmed && trimmed !== task.name) {
			void updateTask(boardId, column.id, task.id, { name: trimmed }).catch(() => undefined);
		}
	}

	return (
		<div
			className={`${styles.task} ${isDragSource ? styles.dragging : ""}`}
			draggable
			data-task-id={task.id}
			onDragStart={(e) => {
				// don't let the column lane interpret this as a column drag
				e.stopPropagation();
				e.dataTransfer.effectAllowed = "move";
				onDragStartTask(task, column.id);
			}}
			onDragEnd={onDragEnd}
			onDragOver={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onDrop={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onDropOnTask(task.id, column.id);
			}}
		>
			<div className={styles.taskTop}>
				<span className={styles.handle} title="Drag task">
					⠿
				</span>
				{renaming ? (
					<input
						className={styles.rename}
						value={title}
						autoFocus
						draggable={false}
						onClick={(e) => e.stopPropagation()}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={commitRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitRename();
							if (e.key === "Escape") setRenaming(false);
						}}
					/>
				) : (
					<span
						className={styles.taskName}
						data-task-name={task.id}
						onDoubleClick={() => {
							setTitle(task.name);
							setRenaming(true);
						}}
						title="Double-click to rename"
					>
						{task.name}
					</span>
				)}
				<button
					type="button"
					className="icon-btn"
					title="Edit task"
					onClick={(e) => {
						e.stopPropagation();
						onEdit(task);
					}}
				>
					✎
				</button>
				<button type="button" className="icon-btn" title="Delete task" onClick={() => void deleteTask(boardId, column.id, task.id).catch(() => undefined)}>
					✕
				</button>
			</div>
			{task.description && <div className={styles.taskDesc}>{task.description}</div>}
			{hasBadges && (
				<div className={styles.badges}>
					{task.priority && (
						<span className={`${styles.priority} ${styles[`prio_${task.priority}`]}`}>
							{task.priority}
						</span>
					)}
					{task.tags.map((tag) => (
						<span
							key={tag.id}
							className={styles.tag}
							style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
						>
							{tag.name}
						</span>
					))}
					{task.assignee && <span className={styles.metaBadge}>@{task.assignee}</span>}
					{task.estimate !== null && <span className={styles.metaBadge}>{task.estimate} pts</span>}
					{task.dueAt && <span className={styles.metaBadge}>{formatDue(task.dueAt)}</span>}
				</div>
			)}
			<div className={styles.taskMeta}>
				{task.claimedBy ? (
					<>
						<span className={styles.claimedBadge}>{task.claimedBy}</span>
						<button
							type="button"
							className="btn btn-ghost"
							title="Release the task"
							onClick={() => void releaseTask(boardId, column.id, task.id).catch(() => undefined)}
						>
							Release
						</button>
					</>
				) : column.isQueue ? (
					<button
						type="button"
						className="btn btn-ghost"
						title="Claim the task"
						onClick={() => void claimTask(boardId, column.id, task.id).catch(() => undefined)}
					>
						Claim
					</button>
				) : null}
			</div>
		</div>
	);
}

function ColumnCard({
	column,
	boardId,
	drag,
	onColumnDragStart,
	onColumnDrop,
	onTaskDragStart,
	onDropOnTask,
	onDragEnd,
	onEdit,
}: {
	column: Column;
	boardId: string;
	drag: DragState;
	onColumnDragStart: (id: number) => void;
	onColumnDrop: (id: number) => void;
	onTaskDragStart: (task: Task, columnId: number) => void;
	onDropOnTask: (taskId: number, columnId: number) => void;
	onDragEnd: () => void;
	onEdit: (task: Task) => void;
}) {
	const { updateColumn, deleteColumn, createTask } = useClientActions();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");
	const [taskName, setTaskName] = useState("");
	const [confirming, setConfirming] = useState(false);

	function commitRename() {
		setRenaming(false);
		const trimmed = title.trim();
		if (trimmed && trimmed !== column.name) {
			void updateColumn(boardId, column.id, { name: trimmed }).catch(() => undefined);
		}
	}

	function confirmDelete() {
		setConfirming(false);
		void deleteColumn(boardId, column.id).catch(() => undefined);
	}

	function addTask(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = taskName.trim();
		if (!trimmed) return;
		setTaskName("");
		void createTask(boardId, column.id, { name: trimmed }).catch(() => undefined);
	}

	return (
		<>
			<div
				className={`${styles.card} ${drag?.kind === "column" && drag.id === column.id ? styles.dragging : ""}`}
				draggable
				data-column-id={column.id}
				onDragStart={(e) => {
					e.dataTransfer.effectAllowed = "move";
					onColumnDragStart(column.id);
				}}
				onDragEnd={onDragEnd}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					onColumnDrop(column.id);
				}}
			>
				<div className={styles.cardTop}>
					<span className={styles.handle} title="Drag to reorder">
						⠿
					</span>
					{renaming ? (
						<input
							className={styles.rename}
							value={title}
							autoFocus
							draggable={false}
							onClick={(e) => e.stopPropagation()}
							onChange={(e) => setTitle(e.target.value)}
							onBlur={commitRename}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitRename();
								if (e.key === "Escape") setRenaming(false);
							}}
						/>
					) : (
						<span
							className={styles.name}
							data-column-name={column.id}
							onDoubleClick={() => {
								setTitle(column.name);
								setRenaming(true);
							}}
							title="Double-click to rename"
						>
							{column.name}
						</span>
					)}
					<button
						type="button"
						className="icon-btn"
						title="Delete column"
						onClick={() => setConfirming(true)}
					>
						✕
					</button>
				</div>
				<button
				type="button"
				className={`${styles.queueToggle} ${column.isQueue ? styles.queueOn : ""}`}
				title={
					column.isQueue
						? "Queue column — agents can claim its tasks. Click to make it a normal column."
						: "Mark as a queue so agents can claim its tasks."
				}
				onClick={() => void updateColumn(boardId, column.id, { isQueue: !column.isQueue }).catch(() => undefined)}
			>
				{column.isQueue ? "queue" : "+ queue"}
			</button>

				<div className={styles.tasks}>
					{column.tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							column={column}
							boardId={boardId}
							isDragSource={drag?.kind === "task" && drag.id === task.id}
							onDragStartTask={onTaskDragStart}
							onDropOnTask={onDropOnTask}
							onDragEnd={onDragEnd}
							onEdit={onEdit}
						/>
					))}
					{column.tasks.length === 0 && <div className={styles.empty}>No tasks</div>}
				</div>

				<form className={styles.addTask} onSubmit={addTask}>
					<input
						value={taskName}
						placeholder="Add task…"
						aria-label={`New task in ${column.name}`}
						onChange={(e) => setTaskName(e.target.value)}
					/>
					<button type="submit" className="btn btn-primary" disabled={!taskName.trim()}>
						Add
					</button>
				</form>
			</div>
			<ConfirmDialog
				open={confirming}
				title="Delete column"
				message={`Delete column "${column.name}"?`}
				confirmLabel="Delete"
				danger
				onConfirm={confirmDelete}
				onCancel={() => setConfirming(false)}
			/>
		</>
	);
}

export function BoardPage() {
	const { boardId = "" } = useParams();
	const navigate = useNavigate();
	const client = useBackdash();
	const board = useBoard(boardId);
	const { createColumn, reorderColumns, deleteBoard, moveTask } = useClientActions();

	const [missingId, setMissingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [drag, setDrag] = useState<DragState>(null);
	const [confirming, setConfirming] = useState(false);
	const [editing, setEditing] = useState<{ columnId: number; taskId: number } | null>(null);
	const [tagsOpen, setTagsOpen] = useState(false);
	const notFound = missingId === boardId;

	// Resolve the editor's task from the live board so it stays fresh while open
	const editingTask = editing
		? board?.columns
				.find((c) => c.id === editing.columnId)
				?.tasks.find((t) => t.id === editing.taskId) ?? null
		: null;

	useEffect(() => {
		client
			.getBoard(boardId)
			.catch((error) => {
				if (error instanceof BackdashError && error.status === 404) setMissingId(boardId);
			});
	}, [client, boardId]);

	// Reorder columns; `targetId` null means "dropped outside a column" (go to end).
	function handleColumnDrop(targetId: number | null) {
		if (drag?.kind !== "column" || !board) {
			setDrag(null);
			return;
		}
		const dragId = drag.id;
		const ids = board.columns.map((c) => c.id);
		const from = ids.indexOf(dragId);
		if (targetId !== null && targetId !== dragId) {
			const forward = from < ids.indexOf(targetId);
			ids.splice(from, 1);
			ids.splice(ids.indexOf(targetId) + (forward ? 1 : 0), 0, dragId);
		} else if (targetId === null) {
			ids.splice(from, 1);
			ids.push(dragId);
		} else {
			setDrag(null);
			return;
		}
		void reorderColumns(board.id, ids).catch(() => undefined);
		setDrag(null);
	}

	function handleTaskDrop(target: { columnId: number; position?: number } | null) {
		if (drag?.kind !== "task" || !board) {
			setDrag(null);
			return;
		}
		// Dropping outside a column is a no-op: the task stays where it was.
		if (target) {
			void moveTask(board.id, drag.id, { columnId: target.columnId, position: target.position }).catch(
				() => undefined,
			);
		}
		setDrag(null);
	}

	function onColumnDrop(columnId: number) {
		if (drag?.kind === "column") handleColumnDrop(columnId);
		else if (drag?.kind === "task") handleTaskDrop({ columnId });
		else setDrag(null);
	}

	function onDropOnTask(targetTaskId: number, columnId: number) {
		if (drag?.kind === "task" && board) {
			const target = board.columns.find((c) => c.id === columnId)?.tasks.find((t) => t.id === targetTaskId);
			// insert just before the hovered task
			if (target) handleTaskDrop({ columnId, position: target.position });
		}
		setDrag(null);
	}

	function onTaskDragStart(task: Task, columnId: number) {
		setDrag({ kind: "task", id: task.id, fromColumnId: columnId });
	}

	function onColumnDragStart(id: number) {
		setDrag({ kind: "column", id });
	}

	function addColumn(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || !board) return;
		setName("");
		void createColumn(board.id, { name: trimmed }).catch(() => undefined);
	}

	function deleteBoardConfirmed() {
		if (!board) return;
		setConfirming(false);
		void deleteBoard(board.id)
			.then(() => navigate("/boards"))
			.catch(() => undefined);
	}

	if (notFound) {
		return (
			<div className={styles.page}>
				<div className={styles.inner}>
					<p>Board not found.</p>
					<Link to="/boards">Back to boards</Link>
				</div>
			</div>
		);
	}

	if (!board) {
		return (
			<div className={styles.page}>
				<div className={styles.inner}>
					<p>Loading…</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className={styles.page}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				if (drag?.kind === "column") handleColumnDrop(null);
				else setDrag(null);
			}}
		>
			<div className={styles.inner}>
				<div className={styles.header}>
					<button type="button" className="btn btn-ghost" onClick={() => navigate("/boards")}>
						← Boards
					</button>
					<h1 className={styles.title}>{board.name}</h1>
					<button
						type="button"
						className="btn btn-ghost"
						title="Create and edit task tags"
						onClick={() => setTagsOpen(true)}
					>
						Tags
					</button>
					<button
						type="button"
						className="icon-btn"
						title="Delete board"
						onClick={() => setConfirming(true)}
					>
						✕
					</button>
				</div>

				<div className={styles.columns}>
					{board.columns.map((column) => (
						<ColumnCard
							key={column.id}
							column={column}
							boardId={board.id}
							drag={drag}
							onColumnDragStart={onColumnDragStart}
							onColumnDrop={onColumnDrop}
							onTaskDragStart={onTaskDragStart}
							onDropOnTask={onDropOnTask}
							onDragEnd={() => setDrag(null)}
							onEdit={(task) => setEditing({ columnId: task.columnId, taskId: task.id })}
						/>
					))}
					{board.columns.length === 0 && (
						<div className={styles.hint}>No columns yet. Add one below.</div>
					)}
					<form className={styles.addCard} onSubmit={addColumn}>
						<input
							value={name}
							placeholder="Add column…"
							aria-label="New column name"
							onChange={(e) => setName(e.target.value)}
						/>
						<button type="submit" className="btn btn-primary" disabled={!name.trim()}>
							Add
						</button>
					</form>
				</div>
			</div>
			<ConfirmDialog
				open={confirming}
				title="Delete board"
				message={`Delete board "${board.name}"? This removes its columns.`}
				confirmLabel="Delete"
				danger
				onConfirm={deleteBoardConfirmed}
				onCancel={() => setConfirming(false)}
			/>
			{tagsOpen && (
				<TagManager boardId={board.id} open onClose={() => setTagsOpen(false)} />
			)}
			{editingTask && (
				<TaskEditor
					key={editingTask.id}
					boardId={board.id}
					task={editingTask}
					open
					onClose={() => setEditing(null)}
				/>
			)}
		</div>
	);
}
