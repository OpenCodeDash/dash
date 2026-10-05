import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useSessionBusy, useStore, type Message } from "react-opencode";
import { useMessageWindow } from "../../hooks/use-message-window.ts";
import { MessageItem } from "../message-item/message-item.component.tsx";
import styles from "./message-list.module.scss";

// `firstItemIndex` must stay positive; it is decremented by the number of older
// messages prepended so react-virtuoso can preserve the scroll position.
const START_INDEX = 100000;

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
	const atBottom = useRef(true);
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

	// Keep the view pinned to the newest content while streaming, unless the user
	// has scrolled up to read earlier messages.
	useEffect(() => {
		if (atBottom.current) virtuoso.current?.scrollToIndex({ index: "LAST", align: "end" });
	}, [version]);

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
				atBottomStateChange={(value) => {
					atBottom.current = value;
				}}
				increaseViewportBy={{ top: 600, bottom: 800 }}
				style={{ height: "100%" }}
			/>
		</div>
	);
}
