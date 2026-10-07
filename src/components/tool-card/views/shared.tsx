import type { Todo, ToolState } from "react-opencode";
import styles from "../tool-card.module.scss";

const TODO_ICON: Record<Todo["status"], string> = {
	pending: "○",
	in_progress: "●",
	completed: "✓",
	cancelled: "✕",
};

export function TodoList({ todos }: { todos: Todo[] }) {
	return (
		<div className={styles.todos}>
			{todos.map((todo, i) => (
				<div key={i} className={styles.todo}>
					<span className={`${styles.todoIcon} ${styles[`todo_${todo.status}`]}`}>
						{TODO_ICON[todo.status] ?? "○"}
					</span>
					<span className={styles.todoText}>{todo.content}</span>
				</div>
			))}
		</div>
	);
}

export function Output({ state, className }: { state: ToolState; className?: string }) {
	if (state.status === "completed") {
		return <pre className={`${styles.pre} ${className ?? ""}`}>{state.output}</pre>;
	}
	if (state.status === "error") {
		return <pre className={`${styles.pre} ${styles.preError} ${className ?? ""}`}>{state.error}</pre>;
	}
	return null;
}

export function CodeLines({ text }: { text: string }) {
	return (
		<div className={styles.code}>
			{text.split("\n").map((line, i) => {
				const numbered = line.match(/^(\d+):\s?(.*)$/s);
				return (
					<div key={i} className={styles.codeLine}>
						<span className={styles.lineNo}>{numbered ? numbered[1] : i + 1}</span>
						<span className={styles.lineText}>{numbered ? numbered[2] : line}</span>
					</div>
				);
			})}
		</div>
	);
}

export function GenericBody({ state }: { state: ToolState }) {
	return (
		<>
			{state.input && <pre className={styles.pre}>{JSON.stringify(state.input, null, 2)}</pre>}
			{state.status === "completed" && <pre className={styles.pre}>{state.output}</pre>}
			{state.status === "error" && (
				<pre className={`${styles.pre} ${styles.preError}`}>{state.error}</pre>
			)}
		</>
	);
}
