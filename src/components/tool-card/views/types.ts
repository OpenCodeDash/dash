import type { ReactNode } from "react";
import type { ToolPart, ToolState } from "react-opencode";

export interface ToolView {
	summary?: (state: ToolState) => ReactNode;
	body: (part: ToolPart) => ReactNode;
}

export interface QuestionInput {
	header?: string;
	question?: string;
	options?: { label: string; description?: string }[];
}

export function str(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

export function num(v: unknown): number | undefined {
	return typeof v === "number" ? v : undefined;
}

export function idStr(v: unknown): string | undefined {
	return typeof v === "number" || typeof v === "string" ? String(v) : undefined;
}

/** Only http(s) URLs are safe to render as a clickable href. */
export function httpUrl(v: unknown): string | undefined {
	const value = str(v);
	if (!value) return undefined;
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:" ? value : undefined;
	} catch {
		return undefined;
	}
}

export function obj(v: unknown): Record<string, unknown> | undefined {
	return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

export function inputOf(state: ToolState): Record<string, unknown> {
	return state.status === "pending" ? (state.input ?? {}) : state.input;
}

export function metadataOf(state: ToolState): Record<string, unknown> {
	return (state as { metadata?: Record<string, unknown> }).metadata ?? {};
}

export function diffOf(metadata: Record<string, unknown>): string | undefined {
	if (typeof metadata.diff === "string") return metadata.diff;
	const filediff = obj(metadata.filediff);
	if (filediff && typeof filediff.patch === "string") return filediff.patch;
	return undefined;
}

export function genericTitle(state: ToolState): string {
	if (state.status === "completed") return state.title;
	if (state.status === "running") return state.title ?? "";
	return "";
}

export function todoProgress(v: unknown): { done: number; total: number } | undefined {
	if (!Array.isArray(v) || v.length === 0) return undefined;
	const done = v.filter((t) => obj(t)?.status === "completed").length;
	return { done, total: v.length };
}
