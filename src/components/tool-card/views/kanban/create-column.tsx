import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanCreateColumn: ToolView = {
	summary: (state) => {
		const input = inputOf(state);
		const name = str(input.name);
		if (!name) return "Column";
		return input.is_queue === true ? `${name} (queue)` : name;
	},
	body: (part) => <Output state={part.state} />,
};
