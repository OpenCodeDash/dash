import { useCallback, useEffect, useRef, useState } from "react";

/** A message the user composed while the session was busy. */
export interface QueuedMessage {
	id: string;
	text: string;
	modelKey: string;
	agent: string;
}

/**
 * A session's pending outgoing messages. While the session is busy the user can
 * queue a message instead of blocking, and each one is sent in FIFO order once
 * the session goes idle. `send` must resolve only after its turn has settled, so
 * the next queued message starts after the previous one finishes.
 */
export function useMessageQueue(busy: boolean, send: (message: QueuedMessage) => Promise<void>) {
	const [queue, setQueue] = useState<QueuedMessage[]>([]);
	const flushing = useRef(false);
	const nextId = useRef(0);
	const sendRef = useRef(send);
	useEffect(() => {
		sendRef.current = send;
	});

	const enqueue = useCallback((message: Omit<QueuedMessage, "id">) => {
		nextId.current += 1;
		setQueue((cur) => [...cur, { ...message, id: `queued-${nextId.current}` }]);
	}, []);

	const remove = useCallback((id: string) => {
		setQueue((cur) => cur.filter((message) => message.id !== id));
	}, []);

	// Drain the head whenever the session is idle. `send` is blocking, so this
	// only runs once per turn and the queue empties in order.
	useEffect(() => {
		if (busy || flushing.current) return;
		const next = queue[0];
		if (!next) return;
		flushing.current = true;
		sendRef.current(next)
			.then(() => {
				setQueue((cur) => (cur[0]?.id === next.id ? cur.slice(1) : cur));
			})
			.catch(() => {
				// Leave the failed message at the head; the composer shows the error.
			})
			.finally(() => {
				flushing.current = false;
			});
	}, [busy, queue]);

	return { queue, enqueue, remove };
}
