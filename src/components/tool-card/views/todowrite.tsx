import type { Todo } from "react-opencode";
import { inputOf, obj, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import styles from "../tool-card.module.scss";

const TODO_ICON: Record<Todo["status"], string> = {
	pending: "○",
	in_progress: "●",
	completed: "✓",
	cancelled: "✕",
};

export const todowriteTool: ToolView = {
	summary: (state) => {
		const todos = inputOf(state).todos;
		if (!Array.isArray(todos) || todos.length === 0) return undefined;
		const done = todos.filter((t) => obj(t)?.status === "completed").length;
		return `${done}/${todos.length} todos`;
	},
	body: (part) => {
		const todos = inputOf(part.state).todos;
		if (!Array.isArray(todos) || todos.length === 0) return <Output state={part.state} />;
		return (
			<div className={styles.todos}>
				{todos.map((raw, i) => {
					const todo = raw as Todo;
					return (
						<div key={i} className={styles.todo}>
							<span className={`${styles.todoIcon} ${styles[`todo_${todo.status}`]}`}>
								{TODO_ICON[todo.status] ?? "○"}
							</span>
							<span className={styles.todoText}>{todo.content}</span>
						</div>
					);
				})}
			</div>
		);
	},
};
