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
import { kanbanListBoards } from "./kanban/list-boards.tsx";
import { kanbanGetBoard } from "./kanban/get-board.tsx";
import { kanbanCreateBoard } from "./kanban/create-board.tsx";
import { kanbanRenameBoard } from "./kanban/rename-board.tsx";
import { kanbanDeleteBoard } from "./kanban/delete-board.tsx";
import { kanbanListTags } from "./kanban/list-tags.tsx";
import { kanbanCreateTag } from "./kanban/create-tag.tsx";
import { kanbanUpdateTag } from "./kanban/update-tag.tsx";
import { kanbanDeleteTag } from "./kanban/delete-tag.tsx";
import { kanbanCreateTask } from "./kanban/create-task.tsx";
import { kanbanUpdateTask } from "./kanban/update-task.tsx";
import { kanbanMoveTask } from "./kanban/move-task.tsx";
import { kanbanClaimTask } from "./kanban/claim-task.tsx";
import { kanbanReleaseTask } from "./kanban/release-task.tsx";
import { kanbanDeleteTask } from "./kanban/delete-task.tsx";
import { kanbanSetTaskTodos } from "./kanban/set-task-todos.tsx";
import { kanbanCreateColumn } from "./kanban/create-column.tsx";
import { kanbanUpdateColumn } from "./kanban/update-column.tsx";
import { kanbanDeleteColumn } from "./kanban/delete-column.tsx";
import { kanbanReorderColumns } from "./kanban/reorder-columns.tsx";

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
	kanban_list_boards: kanbanListBoards,
	kanban_get_board: kanbanGetBoard,
	kanban_create_board: kanbanCreateBoard,
	kanban_rename_board: kanbanRenameBoard,
	kanban_delete_board: kanbanDeleteBoard,
	kanban_list_tags: kanbanListTags,
	kanban_create_tag: kanbanCreateTag,
	kanban_update_tag: kanbanUpdateTag,
	kanban_delete_tag: kanbanDeleteTag,
	kanban_create_task: kanbanCreateTask,
	kanban_update_task: kanbanUpdateTask,
	kanban_move_task: kanbanMoveTask,
	kanban_claim_task: kanbanClaimTask,
	kanban_release_task: kanbanReleaseTask,
	kanban_delete_task: kanbanDeleteTask,
	kanban_set_task_todos: kanbanSetTaskTodos,
	kanban_create_column: kanbanCreateColumn,
	kanban_update_column: kanbanUpdateColumn,
	kanban_delete_column: kanbanDeleteColumn,
	kanban_reorder_columns: kanbanReorderColumns,
};

export function viewFor(tool: string): ToolView | undefined {
	return REGISTRY[tool];
}
