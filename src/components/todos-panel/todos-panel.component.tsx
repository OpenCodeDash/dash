import { useTodos, type Todo } from "react-opencode";
import styles from "./todos-panel.module.scss";

const STATUS_ICON: Record<Todo["status"], string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
	cancelled: "✕",
};

export function TodosPanel({ sessionId }: { sessionId: string }) {
	const todos = useTodos(sessionId);

	return (
		<aside className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Todos</h2>
			</div>
			{todos.length === 0 ? (
				<p className="panel-empty">No todos yet.</p>
			) : (
				<div className="panel-body">
					<ul className={styles.list}>
						{todos.map((todo, i) => (
							<li key={`${i}-${todo.content}`} className={`${styles.todo} ${styles[todo.status]}`}>
								<span className={styles.icon}>{STATUS_ICON[todo.status]}</span>
								<span className={styles.content}>{todo.content}</span>
								<span className={`${styles.priority} ${styles[`prio_${todo.priority}`]}`}>
									{todo.priority}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</aside>
	);
}
