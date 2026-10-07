import { idStr, inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanMoveTask: ToolView = {
	summary: (state) => {
		const input = inputOf(state);
		const id = idStr(input.task_id);
		const to = str(input.to_column);
		return id && to ? `#${id} → ${to}` : undefined;
	},
	body: (part) => <Output state={part.state} />,
};
