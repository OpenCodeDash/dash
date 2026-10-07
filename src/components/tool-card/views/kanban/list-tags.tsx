import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import { parseTagList } from "./parse.ts";
import { TagList } from "./components.tsx";

export const kanbanListTags: ToolView = {
	summary: (state) => str(inputOf(state).board),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const tags = parseTagList(part.state.output);
		return tags.length ? <TagList tags={tags} /> : <Output state={part.state} />;
	},
};
