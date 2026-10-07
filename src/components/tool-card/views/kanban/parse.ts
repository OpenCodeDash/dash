export interface KanbanBoardRef {
	name: string;
	id: string;
}

export interface KanbanBoardTask {
	id: number;
	name: string;
	tags: string[];
	description?: string;
}

export interface KanbanBoardColumn {
	name: string;
	queue: boolean;
	tasks: KanbanBoardTask[];
}

export interface KanbanBoard {
	title: string;
	id: string;
	tags: string[];
	columns: KanbanBoardColumn[];
}

export interface KanbanTag {
	id: number;
	name: string;
	color: string;
	description?: string;
	prompt?: string;
}

export function parseBoardList(text: string): KanbanBoardRef[] {
	return text
		.split("\n")
		.map((line) => line.match(/^- (.+) \(id (.+)\)$/))
		.filter((m): m is RegExpMatchArray => m !== null)
		.map((m) => ({ name: m[1], id: m[2] }));
}

export function parseBoard(text: string): KanbanBoard | undefined {
	const lines = text.split("\n");
	const head = lines[0]?.match(/^# (.+) \(id (.+)\)$/);
	if (!head) return undefined;
	const board: KanbanBoard = { title: head[1], id: head[2], tags: [], columns: [] };

	let column: KanbanBoardColumn | undefined;
	let task: KanbanBoardTask | undefined;
	for (const line of lines.slice(1)) {
		const tagLine = line.match(/^Tags: (.*)$/);
		if (tagLine) {
			board.tags = tagLine[1].split(",").map((t) => t.trim()).filter(Boolean);
			continue;
		}
		const col = line.match(/^ {2}(.+?)( \[queue\])? \(#(\d+)\)$/);
		if (col) {
			column = { name: col[1], queue: Boolean(col[2]), tasks: [] };
			board.columns.push(column);
			task = undefined;
			continue;
		}
		const item = line.match(/^ {4}#(\d+) (.*)$/);
		if (item && column) {
			let name = item[2];
			let tags: string[] = [];
			const bracket = name.match(/ \[([^\]]*)\]$/);
			if (bracket) {
				name = name.slice(0, name.length - bracket[0].length);
				const tagMatch = bracket[1].match(/tags: (.+)$/);
				if (tagMatch) tags = tagMatch[1].split(",").map((t) => t.trim());
			}
			task = { id: Number(item[1]), name, tags };
			column.tasks.push(task);
			continue;
		}
		const detail = line.match(/^ {8}(.*)$/);
		if (detail && task && detail[1].trim()) {
			task.description = task.description ? `${task.description}\n${detail[1]}` : detail[1];
		}
	}
	return board;
}

export function parseTagList(text: string): KanbanTag[] {
	const tags: KanbanTag[] = [];
	let current: KanbanTag | undefined;
	for (const line of text.split("\n")) {
		const head = line.match(/^ {2}#(\d+) (\S+) (#[0-9a-fA-F]{3,8})$/);
		if (head) {
			current = { id: Number(head[1]), name: head[2], color: head[3] };
			tags.push(current);
			continue;
		}
		const detail = line.match(/^ {4}(.*)$/);
		if (detail && current) {
			const value = detail[1];
			if (value.startsWith("prompt:")) {
				current.prompt = value.slice("prompt:".length).trim();
			} else if (value.trim()) {
				current.description = current.description ? `${current.description}\n${value}` : value;
			}
		}
	}
	return tags;
}
