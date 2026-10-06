import { diffOf, inputOf, metadataOf, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import { DiffText } from "../../file-diff-panel/file-diff-panel.component.tsx";

export const editTool: ToolView = {
	summary: (state) => str(inputOf(state).filePath),
	body: (part) => {
		const diff = diffOf(metadataOf(part.state));
		return diff ? <DiffText text={diff} /> : <Output state={part.state} />;
	},
};
