import { useCallback, useEffect, useRef, useState } from "react";
import { useOpenCode, useStore, type Message, type Part } from "react-opencode";

// Messages are loaded newest-first in fixed chunks. The opencode server returns
// the newest `limit` messages plus an `X-Next-Cursor` header; passing that opaque
// cursor back as `before` yields the next older chunk.
const CHUNK = 60;
const EMPTY_MESSAGES: Message[] = [];

interface Entry {
	info: Message;
	parts: Part[];
}

interface PaginationState {
	cursor: string | null;
	hasMore: boolean;
}

// Survives session switches (MessageList remounts per session) so revisiting a
// session neither refetches the first chunk nor loses the "load older" cursor.
const paginationCache = new Map<string, PaginationState>();

export interface MessageWindow {
	messages: Message[];
	loaded: boolean;
	hasMore: boolean;
	/** Fetch and merge the next older chunk. Resolves with how many were added. */
	loadOlder: () => Promise<number>;
}

export function useMessageWindow(sessionID: string): MessageWindow {
	const client = useOpenCode();
	const messages = useStore((s) => s.messages[sessionID] ?? EMPTY_MESSAGES);

	// A session is already primed when we have both its messages (from a prior
	// visit) and the cached pagination cursor; otherwise we must load a chunk.
	const cached = paginationCache.get(sessionID);
	const primed = Boolean(cached && (client.store.state.messages[sessionID]?.length ?? 0) > 0);

	const [loaded, setLoaded] = useState(primed);
	const [hasMore, setHasMore] = useState(primed ? cached!.hasMore : false);
	const cursorRef = useRef<string | null>(primed ? cached!.cursor : null);
	const loadingRef = useRef(false);

	const fetchPage = useCallback(
		async (before: string | null) => {
			const params = new URLSearchParams({ limit: String(CHUNK) });
			if (before) params.set("before", before);
			const res = await fetch(`${client.url}/session/${sessionID}/message?${params}`);
			if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
			const entries = (await res.json()) as Entry[];
			return { entries, cursor: res.headers.get("x-next-cursor") };
		},
		[client, sessionID],
	);

	// Load the newest chunk once per session, unless it is already primed.
	useEffect(() => {
		if (primed) return;
		let cancelled = false;
		fetchPage(null)
			.then(({ entries, cursor }) => {
				if (cancelled) return;
				client.store.setMessages(sessionID, entries);
				cursorRef.current = cursor;
				const more = cursor != null && entries.length === CHUNK;
				paginationCache.set(sessionID, { cursor, hasMore: more });
				setHasMore(more);
				setLoaded(true);
			})
			.catch(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [client, sessionID, fetchPage, primed]);

	const loadOlder = useCallback(async (): Promise<number> => {
		const before = cursorRef.current;
		if (loadingRef.current || !hasMore || !before) return 0;
		loadingRef.current = true;
		try {
			const { entries, cursor } = await fetchPage(before);
			if (entries.length === 0) {
				cursorRef.current = null;
				paginationCache.set(sessionID, { cursor: null, hasMore: false });
				setHasMore(false);
				return 0;
			}
			const known = new Set(client.store.state.messages[sessionID]?.map((m) => m.id));
			const added = entries.reduce((n, e) => n + (known.has(e.info.id) ? 0 : 1), 0);
			client.store.setMessages(sessionID, entries);
			cursorRef.current = cursor;
			const more = cursor != null && entries.length === CHUNK;
			paginationCache.set(sessionID, { cursor, hasMore: more });
			setHasMore(more);
			return added;
		} finally {
			loadingRef.current = false;
		}
	}, [client, sessionID, hasMore, fetchPage]);

	return { messages, loaded, hasMore, loadOlder };
}
