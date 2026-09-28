import { useMessages } from "react-opencode";
import { MessageItem } from "./MessageItem.tsx";

export function MessageList({ sessionId }: { sessionId: string }) {
	const messages = useMessages(sessionId);

	if (messages.length === 0) {
		return <div className="messages-empty">Send a message to start the conversation.</div>;
	}

	return (
		<div className="messages">
			{messages.map((message) => (
				<MessageItem key={message.id} message={message} />
			))}
		</div>
	);
}
