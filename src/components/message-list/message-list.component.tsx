import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useSessionBusy, useStore, type Message } from "react-opencode";
import { useMessageWindow } from "../../hooks/use-message-window.ts";
import { MessageItem } from "../message-item/message-item.component.tsx";
import styles from "./message-list.module.scss";

// `firstItemIndex` must stay positive; it is decremented by the number of older
// messages prepended so react-virtuoso can preserve the scroll position.
const START_INDEX = 100000;

// Within this many pixels of the bottom the list is considered "following"
// again, so a user who scrolls back down re-pins to the newest content.
const BOTTOM_THRESHOLD = 24;
// An upward movement larger than this is a deliberate user scroll, not layout
// jitter from streamed content resizing the transcript.
const USER_SCROLL_DELTA = 24;

interface MessageListProps {
	sessionId: string;
	/** Session's revert point; messages from here on are rolled back. */
	revertMessageID?: string;
	actionsDisabled?: boolean;
	onFork?: (message: Message) => void;
	onRevert?: (message: Message) => void;
}

export function MessageList({
	sessionId,
	revertMessageID,
	actionsDisabled,
	onFork,
	onRevert,
}: MessageListProps) {
	const { messages, loaded, hasMore, loadOlder } = useMessageWindow(sessionId);
	const busy = useSessionBusy(sessionId);
	const version = useStore((s) => s.version);
	const virtuoso = useRef<VirtuosoHandle>(null);
	// Whether the newest content should stay in view. Starts true so the first
	// message follows. Only an explicit upward user scroll clears it: streamed
	// content growing the last message also moves the bottom, so gating on
	// react-virtuoso's `atBottomStateChange` would stop following the moment the
	// first token arrived.
	const stick = useRef(true);
	const scroller = useRef<HTMLElement | null>(null);
	const lastScrollTop = useRef(0);
	const loadingOlder = useRef(false);
	const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);

	const lastId = messages[messages.length - 1]?.id;

	// Messages at/after the revert point are still in the transcript but will be
	// dropped on the next prompt; dim them and let the page offer "restore".
	const revertedIds = useMemo(() => {
		if (!revertMessageID) return null;
		const at = messages.findIndex((m) => m.id === revertMessageID);
		if (at < 0) return null;
		return new Set(messages.slice(at).map((m) => m.id));
	}, [messages, revertMessageID]);

	// Keep the view pinned to the newest content while streaming or after a new
	// message arrives, unless the user has scrolled up to read earlier messages.
	useEffect(() => {
		if (stick.current) virtuoso.current?.scrollToIndex({ index: "LAST", align: "end" });
	}, [version]);

	const onScroll = useCallback(() => {
		const el = scroller.current;
		if (!el) return;
		const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		if (fromBottom <= BOTTOM_THRESHOLD) {
			stick.current = true;
		} else if (el.scrollTop < lastScrollTop.current - USER_SCROLL_DELTA) {
			stick.current = false;
		}
		lastScrollTop.current = el.scrollTop;
	}, []);

	// react-virtuoso owns the scroll element; watch it directly so user intent is
	// read from the real scroll position (wheel, touch, keyboard and scrollbar all
	// move it). Content growth that is immediately followed leaves the position at
	// the bottom, so it never gets mistaken for scrolling away.
	const setScroller = useCallback(
		(ref: HTMLElement | Window | null) => {
			scroller.current?.removeEventListener("scroll", onScroll);
			scroller.current = ref instanceof HTMLElement ? ref : null;
			if (scroller.current) {
				lastScrollTop.current = scroller.current.scrollTop;
				scroller.current.addEventListener("scroll", onScroll, { passive: true });
			}
		},
		[onScroll],
	);

	const onStartReached = useCallback(() => {
		if (!hasMore || loadingOlder.current) return;
		loadingOlder.current = true;
		loadOlder()
			.then((added) => {
				if (added > 0) setFirstItemIndex((index) => index - added);
			})
			.finally(() => {
				loadingOlder.current = false;
			});
	}, [hasMore, loadOlder]);

	if (messages.length === 0) {
		return (
			<div className={styles.empty}>{loaded ? "Send a message to start the conversation." : "Loading…"}</div>
		);
	}

	return (
		<div className={styles.messages}>
			<Virtuoso
				ref={virtuoso}
				scrollerRef={setScroller}
				data={messages}
				firstItemIndex={firstItemIndex}
				initialTopMostItemIndex={{ index: "LAST" }}
				computeItemKey={(_, message) => message.id}
				itemContent={(_, message) => (
					<div className={styles.item}>
						<MessageItem
							message={message}
							streaming={busy && message.id === lastId}
							reverted={revertedIds?.has(message.id) ?? false}
							actionsDisabled={actionsDisabled}
							onFork={onFork}
							onRevert={onRevert}
						/>
					</div>
				)}
				startReached={onStartReached}
				increaseViewportBy={{ top: 600, bottom: 800 }}
				style={{ height: "100%" }}
			/>
		</div>
	);
}
