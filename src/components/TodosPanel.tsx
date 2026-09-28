import { useTodos, type Todo } from 'react-opencode'

const STATUS_ICON: Record<Todo['status'], string> = {
	pending: '○',
	in_progress: '◐',
	completed: '●',
	cancelled: '✕',
}

export function TodosPanel({ sessionId }: { sessionId: string }) {
	const todos = useTodos(sessionId)

	return (
		<aside className="panel">
			<h2 className="panel-title">Todos</h2>
			{todos.length === 0 ? (
				<p className="panel-empty">No todos yet.</p>
			) : (
				<ul className="todo-list">
					{todos.map((todo, i) => (
						<li key={`${i}-${todo.content}`} className={`todo todo-${todo.status}`}>
							<span className="todo-icon">{STATUS_ICON[todo.status]}</span>
							<span className="todo-content">{todo.content}</span>
							<span className={`todo-priority prio-${todo.priority}`}>{todo.priority}</span>
						</li>
					))}
				</ul>
			)}
		</aside>
	)
}
