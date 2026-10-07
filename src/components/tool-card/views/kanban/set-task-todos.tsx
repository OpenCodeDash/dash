import type { Todo } from "react-opencode";
import { idStr, inputOf, todoProgress, type ToolView } from "../types.ts";
import { Output, TodoList } from "../shared.tsx";

export const kanbanSetTaskTodos: ToolView = {
	summary: (state) => {
		const input = inputOf(state);
		const progress = todoProgress(input.todos);
		const id = idStr(input.task_id);
		if (!progress) return undefined;
		return id ? `${progress.done}/${progress.total} todos on #${id}` : `${progress.done}/${progress.total} todos`;
	},
	body: (part) => {
		const todos = inputOf(part.state).todos;
		if (!Array.isArray(todos) || todos.length === 0) return <Output state={part.state} />;
		return <TodoList todos={todos as Todo[]} />;
	},
};
