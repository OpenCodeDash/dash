import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanCreateBoard: ToolView = {
	summary: (state) => str(inputOf(state).name),
	body: (part) => <Output state={part.state} />,
};
