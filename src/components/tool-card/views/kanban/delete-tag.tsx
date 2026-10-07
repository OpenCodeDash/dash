import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanDeleteTag: ToolView = {
	summary: (state) => str(inputOf(state).tag),
	body: (part) => <Output state={part.state} />,
};
