import type { FileEntry, McpServerStatus, Session } from "react-opencode";

/** The live `/file` listing includes an `absolute` path beyond the typed schema. */
export interface DirEntry extends FileEntry {
	absolute: string;
	ignored?: boolean;
}

// 127.0.0.1, not localhost: headless Chromium hangs resolving `localhost`
// (fe80::1%lo0 / ::1-first) for cross-origin fetches, but the IPv4 literal works.
// The opencode server binds 0.0.0.0 (IPv4-only), so localhost would never connect.
export const OPENCODE_URL = import.meta.env.VITE_OPENCODE_URL ?? "http://127.0.0.1:4096";

export const BACKDASH_URL = import.meta.env.VITE_BACKDASH_URL ?? "http://127.0.0.1:3000";

/**
 * Shape returned by `GET /path`. The react-opencode client types this loosely
 * as `{ cwd, root }`, but the live server returns a richer object, so widen it.
 */
export interface PathInfo {
	home?: string;
	state?: string;
	config?: string;
	worktree?: string;
	cwd?: string;
	directory?: string;
	root?: string;
}

/**
 * Create a session rooted in a specific directory on the opencode server.
 *
 * The opencode HTTP API reads the working directory from a `?directory=` query
 * parameter on `POST /session` (a body field is ignored), so this bypasses the
 * typed client and issues the request directly.
 */
export async function createSessionInDirectory(
	url: string,
	directory: string,
	input: Record<string, unknown> = {},
): Promise<Session> {
	const qs = directory ? `?directory=${encodeURIComponent(directory)}` : "";
	const res = await fetch(`${url}/session${qs}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Failed to create session (${res.status}) ${body.slice(0, 200)}`.trim());
	}
	return (await res.json()) as Session;
}

/**
 * Request manual compaction of a session. opencode exposes this only on the v2
 * API (`/api/session/:id/compact`), which react-opencode does not wrap, so hit
 * it directly. The response acknowledges the request; it does not wait for the
 * summary, and opencode emits `session.compaction.*` events as it runs.
 */
export async function compactSession(url: string, sessionId: string): Promise<void> {
	const res = await fetch(`${url}/api/session/${encodeURIComponent(sessionId)}/compact`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Failed to compact session (${res.status}) ${body.slice(0, 200)}`.trim());
	}
}

export async function fetchPath(url: string): Promise<PathInfo> {
	const res = await fetch(`${url}/path`);
	if (!res.ok) throw new Error(`Failed to read path (${res.status})`);
	return (await res.json()) as PathInfo;
}

export async function listDirectories(url: string, path: string): Promise<DirEntry[]> {
	const params = new URLSearchParams({ path, type: "dir" });
	const res = await fetch(`${url}/file?${params}`);
	if (!res.ok) throw new Error(`Failed to list directory (${res.status})`);
	const entries = (await res.json()) as DirEntry[];
	return entries.filter((e) => e.type === "directory" && !e.ignored);
}

/**
 * A plugin configured via the `plugin` array in `/config`. Classified so the
 * dashboard can show whether it is present (file:// readable, inline data:) or
 * broken (file:// missing/empty). Bare specifiers are npm packages resolved by
 * the server, so they are reported as "installed".
 */
export interface PluginInfo {
	spec: string;
	kind: "file" | "data" | "npm";
	label: string;
	status: "installed" | "broken" | "unknown";
	detail?: string;
}

export async function fetchConfig(url: string): Promise<Record<string, unknown>> {
	const res = await fetch(`${url}/config`);
	if (!res.ok) throw new Error(`Failed to read config (${res.status})`);
	return (await res.json()) as Record<string, unknown>;
}

async function readFileContent(url: string, path: string): Promise<string> {
	const params = new URLSearchParams({ path });
	const res = await fetch(`${url}/file/content?${params}`);
	if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
	const body = (await res.json()) as { type?: string; content?: string };
	return body.content ?? "";
}

function decodeFileSpec(spec: string): string {
	const rest = spec.slice("file://".length);
	return decodeURIComponent(rest);
}

export async function inspectPlugin(url: string, spec: string): Promise<PluginInfo> {
	if (spec.startsWith("file://")) {
		const path = decodeFileSpec(spec);
		const label = path.split("/").filter(Boolean).pop() ?? path;
		try {
			const content = await readFileContent(url, path);
			return content.trim().length > 0
				? { spec, kind: "file", label, status: "installed", detail: path }
				: { spec, kind: "file", label, status: "broken", detail: "file missing or empty" };
		} catch {
			return { spec, kind: "file", label, status: "broken", detail: "unreadable" };
		}
	}
	if (spec.startsWith("data:")) {
		return { spec, kind: "data", label: "inline (data:)", status: "installed", detail: "inlined into config" };
	}
	return { spec, kind: "npm", label: spec, status: "installed", detail: "npm package" };
}

export function extractPlugins(config: Record<string, unknown>): string[] {
	const raw = config["plugin"];
	if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
	if (typeof raw === "string") return [raw];
	return [];
}

export function mcpEntries(mcp: Record<string, McpServerStatus>): { name: string; server: McpServerStatus }[] {
	return Object.entries(mcp).map(([name, server]) => ({ name, server }));
}
