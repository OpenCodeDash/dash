import { type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import { parseBoardList } from "./parse.ts";
import { BoardList } from "./components.tsx";

export const kanbanListBoards: ToolView = {
	summary: () => "Boards",
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const boards = parseBoardList(part.state.output);
		return boards.length ? <BoardList boards={boards} /> : <Output state={part.state} />;
	},
};
