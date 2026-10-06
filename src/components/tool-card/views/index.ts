import type { ToolView } from "./types.ts";
import { bashTool } from "./bash.tsx";
import { readTool } from "./read.tsx";
import { editTool } from "./edit.tsx";
import { writeTool } from "./write.tsx";
import { globTool } from "./glob.tsx";
import { grepTool } from "./grep.tsx";
import { listTool } from "./list.tsx";
import { webfetchTool } from "./webfetch.tsx";
import { questionTool } from "./question.tsx";
import { todowriteTool } from "./todowrite.tsx";

const REGISTRY: Record<string, ToolView> = {
	bash: bashTool,
	read: readTool,
	edit: editTool,
	write: writeTool,
	glob: globTool,
	grep: grepTool,
	list: listTool,
	webfetch: webfetchTool,
	question: questionTool,
	todowrite: todowriteTool,
};

export function viewFor(tool: string): ToolView | undefined {
	return REGISTRY[tool];
}
