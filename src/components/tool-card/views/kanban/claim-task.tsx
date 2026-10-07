import { idStr, inputOf, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanClaimTask: ToolView = {
	summary: (state) => {
		const id = idStr(inputOf(state).task_id);
		return id ? `Claim #${id}` : "Claim task";
	},
	body: (part) => <Output state={part.state} />,
};
