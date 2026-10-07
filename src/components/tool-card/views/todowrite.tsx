import type { Todo } from "react-opencode";
import { inputOf, todoProgress, type ToolView } from "./types.ts";
import { Output, TodoList } from "./shared.tsx";

export const todowriteTool: ToolView = {
	summary: (state) => {
		const progress = todoProgress(inputOf(state).todos);
		return progress ? `${progress.done}/${progress.total} todos` : undefined;
	},
	body: (part) => {
		const todos = inputOf(part.state).todos;
		if (!Array.isArray(todos) || todos.length === 0) return <Output state={part.state} />;
		return <TodoList todos={todos as Todo[]} />;
	},
};
