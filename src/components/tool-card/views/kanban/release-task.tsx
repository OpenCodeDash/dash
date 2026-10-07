import { idStr, inputOf, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanReleaseTask: ToolView = {
	summary: (state) => {
		const id = idStr(inputOf(state).task_id);
		return id ? `Release #${id}` : "Release task";
	},
	body: (part) => <Output state={part.state} />,
};
