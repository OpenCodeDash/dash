import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanDeleteColumn: ToolView = {
	summary: (state) => str(inputOf(state).column),
	body: (part) => <Output state={part.state} />,
};
