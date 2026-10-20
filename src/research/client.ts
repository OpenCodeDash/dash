import { authHeaders, getStoredToken } from "../auth.ts";
import { BACKDASH_URL } from "../server.ts";

export interface ResearchSummary {
	runId: number;
	stopReason: string;
	discovered: number;
	collected: number;
	hardPass: number;
	shortlisted: number;
	withGaps: number;
	spendUsd: number;
	errors: string[];
}

export interface ResearchCampaignStatus {
	id: string;
	name: string;
	prompt: string;
	domain: string;
	pack: string;
	status: string;
	paused: boolean;
	stopped: boolean;
	running: boolean;
	runId: number | null;
	lastSummary: ResearchSummary | null;
	createdAt: string;
}

export interface ResearchCampaignDetail {
	campaign: ResearchCampaignStatus;
	brief: string;
	criteria?: ResearchCriterion[];
	warnings?: string[];
}

export type ResearchCriterionSource =
	| { type: "field"; field: string }
	| { type: "text"; prompt: string }
	| { type: "image"; prompt: string; options?: string[] }
	| { type: "derived"; evaluator: string; params?: Record<string, unknown> };

export interface ResearchCriterion {
	key: string;
	label: string;
	weight: number;
	kind: "boolean" | "number" | "enum";
	normalizer: Record<string, unknown>;
	source: ResearchCriterionSource;
	origin: "explicit" | "suggested";
	hard?: Record<string, unknown>;
	rationale?: string;
}

export interface ResearchPreview {
	brief: Record<string, unknown>;
	criteria: ResearchCriterion[];
	echo: string;
	warnings: string[];
}

export interface ResearchCriterionBreakdown {
	key: string;
	label: string;
	weight: number;
	known: boolean;
	penalized: boolean;
	normalized: number | null;
	contribution: number;
	policy: string;
	origin?: "explicit" | "suggested";
	sourceType?: string;
	reason?: string;
}

export interface ResearchGap {
	key: string;
	label: string;
	reason: string;
	investigate: boolean;
}

export interface ResearchRow {
	listingId: number;
	rank: number | null;
	score: number;
	coverage: number;
	hardPass: boolean;
	hardFailures: string[];
	url: string;
	source: string;
	status: string;
	fields: Record<string, unknown>;
	breakdown: ResearchCriterionBreakdown[];
	gaps: ResearchGap[];
	questions: string[];
}

export interface ResearchResults {
	campaignId: string;
	generatedAt: string;
	briefVersion: number | null;
	counts: { listings: number; hardPass: number; withGaps: number };
	rows: ResearchRow[];
}

export interface ResearchEvent {
	type: string;
	[key: string]: unknown;
}

export interface FeedbackResult {
	changed: boolean;
	summary: string;
	action: string;
	briefVersion?: number;
	rescored?: number;
}

function messageFrom(data: unknown, status: number): string {
	if (data && typeof data === "object" && "message" in data) {
		const message = (data as { message: unknown }).message;
		if (typeof message === "string") return message;
		if (Array.isArray(message)) return message.join(", ");
	}
	return `Request failed (${status})`;
}

function tokenOrThrow(): string {
	const token = getStoredToken();
	if (!token) throw new Error("Not signed in");
	return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${BACKDASH_URL}${path}`, {
		...init,
		headers: {
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...authHeaders(tokenOrThrow()),
			...(init.headers as Record<string, string> | undefined),
		},
	});
	const data: unknown = await res.json().catch(() => null);
	if (!res.ok) throw new Error(messageFrom(data, res.status));
	return data as T;
}

export function listCampaigns(): Promise<{ campaigns: ResearchCampaignStatus[] }> {
	return request("/research/campaigns");
}

export function createCampaign(input: {
	prompt?: string;
	brief?: string | Record<string, unknown>;
	pack?: string;
	name?: string;
}): Promise<{ campaign: ResearchCampaignStatus }> {
	return request("/research/campaigns", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function previewCampaign(input: {
	prompt: string;
	pack?: string;
}): Promise<ResearchPreview> {
	return request("/research/campaigns/preview", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function getCampaign(id: string): Promise<ResearchCampaignDetail> {
	return request(`/research/campaigns/${encodeURIComponent(id)}`);
}

export function getResults(id: string): Promise<ResearchResults> {
	return request(`/research/campaigns/${encodeURIComponent(id)}/results`);
}

export function sendFeedback(id: string, text: string): Promise<FeedbackResult> {
	return request(`/research/campaigns/${encodeURIComponent(id)}/feedback`, {
		method: "POST",
		body: JSON.stringify({ text }),
	});
}

export function pauseCampaign(id: string): Promise<unknown> {
	return request(`/research/campaigns/${encodeURIComponent(id)}/pause`, {
		method: "POST",
	});
}

export function resumeCampaign(id: string): Promise<unknown> {
	return request(`/research/campaigns/${encodeURIComponent(id)}/resume`, {
		method: "POST",
	});
}

export function stopCampaign(id: string): Promise<unknown> {
	return request(`/research/campaigns/${encodeURIComponent(id)}/stop`, {
		method: "POST",
	});
}

export async function downloadCsv(id: string): Promise<void> {
	const res = await fetch(
		`${BACKDASH_URL}/research/campaigns/${encodeURIComponent(id)}/export.csv`,
		{ headers: authHeaders(tokenOrThrow()) },
	);
	if (!res.ok) {
		const data: unknown = await res.json().catch(() => null);
		throw new Error(messageFrom(data, res.status));
	}
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${id}.csv`;
	anchor.click();
	URL.revokeObjectURL(url);
}

// Backdash relays the harness event stream. Native EventSource cannot attach
// the bearer header, so this uses fetch and parses frames itself.
export function subscribeEvents(
	id: string,
	onEvent: (event: ResearchEvent) => void,
	onError?: (error: Error) => void,
): () => void {
	const controller = new AbortController();
	let closed = false;

	void (async () => {
		const res = await fetch(
			`${BACKDASH_URL}/research/campaigns/${encodeURIComponent(id)}/events`,
			{
				headers: {
					Accept: "text/event-stream",
					...authHeaders(tokenOrThrow()),
				},
				signal: controller.signal,
			},
		);
		if (!res.ok || !res.body) throw new Error(`event stream failed (${res.status})`);

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (!closed) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let index: number;
			while ((index = buffer.indexOf("\n\n")) >= 0) {
				const frame = buffer.slice(0, index);
				buffer = buffer.slice(index + 2);
				const data = frame
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				if (!data) continue;
				try {
					onEvent(JSON.parse(data) as ResearchEvent);
				} catch {
					// ignore malformed frame
				}
			}
		}
	})().catch((error: unknown) => {
		if (closed) return;
		onError?.(error instanceof Error ? error : new Error(String(error)));
	});

	return () => {
		closed = true;
		controller.abort();
	};
}
