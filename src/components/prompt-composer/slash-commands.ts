import type { CommandInfo } from "react-opencode";

/** A command offered in the composer's slash menu. */
export interface SlashCommand {
	name: string;
	description?: string;
}

/** A parsed `/<name> [args]` message. */
export interface ParsedSlashCommand {
	name: string;
	arguments: string;
}

/**
 * Commands handled by dash itself rather than the opencode command endpoint.
 * `/compact` is a client action even though it looks like a server command.
 */
export const BUILTIN_COMMANDS: SlashCommand[] = [
	{ name: "compact", description: "Summarize the session to reduce context size" },
];

/**
 * Parse `/<name> [args]`. Returns null when the text is not a command. Only a
 * leading slash counts, and the name stops at the first whitespace so nested
 * command names (`/team/review`) survive.
 */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
	const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
	if (!match) return null;
	return { name: match[1], arguments: match[2] ?? "" };
}

/**
 * The command name currently being typed: `/<partial>` with no whitespace yet,
 * so the menu closes once the user starts entering arguments.
 */
export function commandQuery(text: string): string | null {
	const match = /^\/([^\s]*)$/.exec(text);
	return match ? match[1] : null;
}

/** Merge server commands with built-ins; a server command wins on a name clash. */
export function mergeCommands(server: CommandInfo[]): SlashCommand[] {
	const names = new Set(server.map((command) => command.name));
	return [
		...server.map((command) => ({ name: command.name, description: command.description })),
		...BUILTIN_COMMANDS.filter((command) => !names.has(command.name)),
	];
}

/** Case-insensitive prefix matches first, then substring matches. */
export function filterCommands(query: string, commands: SlashCommand[]): SlashCommand[] {
	if (!query) return commands;
	const q = query.toLowerCase();
	const prefix: SlashCommand[] = [];
	const rest: SlashCommand[] = [];
	for (const command of commands) {
		const name = command.name.toLowerCase();
		if (name.startsWith(q)) prefix.push(command);
		else if (name.includes(q)) rest.push(command);
	}
	return [...prefix, ...rest];
}
