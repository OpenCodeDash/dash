import { inputOf, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";

export const listTool: ToolView = {
	summary: (state) => str(inputOf(state).path),
	body: (part) => <Output state={part.state} />,
};
