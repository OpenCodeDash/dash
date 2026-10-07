import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import { parseBoard } from "./parse.ts";
import { BoardView } from "./components.tsx";

export const kanbanGetBoard: ToolView = {
	summary: (state) => str(inputOf(state).board),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const board = parseBoard(part.state.output);
		return board ? <BoardView board={board} /> : <Output state={part.state} />;
	},
};
