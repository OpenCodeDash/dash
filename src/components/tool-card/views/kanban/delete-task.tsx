import { idStr, inputOf, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanDeleteTask: ToolView = {
	summary: (state) => {
		const id = idStr(inputOf(state).task_id);
		return id ? `Delete #${id}` : "Delete task";
	},
	body: (part) => <Output state={part.state} />,
};
