import { useCallback, useEffect, useRef, useState } from "react";
import { useOpenCode, useStore, type Message, type Part } from "react-opencode";

// Messages are loaded newest-first in fixed chunks. The opencode server returns
// the newest `limit` messages plus an `X-Next-Cursor` header; passing that opaque
// cursor back as `before` yields the next older chunk.
const CHUNK = 60;
// When the page becomes visible again we refetch the newest chunk to pick up
// messages produced while it was suspended (laptop closed / app backgrounded).
// Resume events fire often (focus, clicks), so cap how frequently we refetch.
const REFRESH_THROTTLE_MS = 3500;
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
	// Latest `loaded` without re-creating the callbacks that read it: a resume
	// refresh is only meaningful once the initial chunk has landed.
	const loadedRef = useRef(loaded);
	// Throttle for resume refreshes (see REFRESH_THROTTLE_MS).
	const lastRefreshRef = useRef(0);

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

	// Keep `loadedRef` current so the resume-refresh callbacks (stable across
	// renders) can read the latest value without re-subscribing on every change.
	useEffect(() => {
		loadedRef.current = loaded;
	}, [loaded]);

	// Re-fetch the newest chunk and merge it in, without touching `loaded`,
	// `hasMore`, or the "load older" cursor — so we only ever ADD anything
	// produced since the last load and never lose older chunks.
	const refreshNewest = useCallback(async () => {
		if (!loadedRef.current || loadingRef.current) return;
		const now = Date.now();
		if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
		lastRefreshRef.current = now;
		loadingRef.current = true;
		try {
			const { entries } = await fetchPage(null);
			client.store.setMessages(sessionID, entries);
		} catch {
			// A missed refresh is not fatal: the next resume or a live event catches up.
		} finally {
			loadingRef.current = false;
		}
	}, [client, sessionID, fetchPage]);

	// Catch up when the page resumes. `visibilitychange` covers tab/OS suspend,
	// `pageshow` covers back/forward from the bfcache, and `focus` covers the
	// remaining cases (e.g. returning to the app). Each is throttled above.
	useEffect(() => {
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void refreshNewest();
		};
		const onPageShow = () => void refreshNewest();
		const onFocus = () => void refreshNewest();
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pageshow", onPageShow);
		window.addEventListener("focus", onFocus);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pageshow", onPageShow);
			window.removeEventListener("focus", onFocus);
		};
	}, [refreshNewest]);

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
