import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanDeleteBoard: ToolView = {
	summary: (state) => str(inputOf(state).board),
	body: (part) => <Output state={part.state} />,
};
