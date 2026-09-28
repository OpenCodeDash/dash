import { useEffect, useRef, useState } from "react";
import { useMessages, useSessionBusy, useStore } from "react-opencode";
import { MessageItem } from "../message-item/message-item.component.tsx";
import styles from "./message-list.module.scss";

export function MessageList({ sessionId }: { sessionId: string }) {
	const messages = useMessages(sessionId);
	const busy = useSessionBusy(sessionId);
	const version = useStore((s) => s.version);
	const ref = useRef<HTMLDivElement>(null);
	const [stick, setStick] = useState(true);

	function onScroll() {
		const el = ref.current;
		if (!el) return;
		setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
	}

	// Keep the view pinned to the newest content while streaming, unless the
	// user has scrolled up to read earlier messages.
	useEffect(() => {
		const el = ref.current;
		if (el && stick) el.scrollTop = el.scrollHeight;
	}, [version, stick, messages.length]);

	if (messages.length === 0) {
		return <div className={styles.empty}>Send a message to start the conversation.</div>;
	}

	const lastId = messages[messages.length - 1]?.id;

	return (
		<div className={styles.messages} ref={ref} onScroll={onScroll}>
			{messages.map((message) => (
				<MessageItem key={message.id} message={message} streaming={busy && message.id === lastId} />
			))}
		</div>
	);
}
