import { useMemo, useState } from "react";
import {
	useAgents,
	useMessageParts,
	useMessages,
	usePrompt,
	useProviders,
	type Message,
	type Part,
} from "react-opencode";
import { Dropdown } from "../dropdown/dropdown.component.tsx";
import styles from "./prompt-composer.module.scss";

// opencode reports the model and agent on the message itself. react-opencode
// types `model` as `{ id, providerID }`, while the running server also sends
// flat `providerID`/`modelID`/`agent` fields, so read both shapes.
interface MessageMeta {
	model?: { providerID?: string; id?: string; modelID?: string };
	providerID?: string;
	modelID?: string;
	agent?: string;
}

function modelKeyOf(message: Message): string | undefined {
	const meta = message as MessageMeta;
	const providerID = meta.model?.providerID ?? meta.providerID;
	const modelID = meta.model?.id ?? meta.model?.modelID ?? meta.modelID;
	return providerID && modelID ? `${providerID}/${modelID}` : undefined;
}

function agentOf(message: Message, parts: Part[]): string | undefined {
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (part.type === "agent") return part.name;
	}
	return (message as MessageMeta).agent;
}

export function PromptComposer({ sessionId, busy }: { sessionId: string; busy: boolean }) {
	const { prompt, abort } = usePrompt(sessionId);
	const providers = useProviders();
	const agents = useAgents();
	const messages = useMessages(sessionId);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);

	const models = useMemo(() => {
		const list: { key: string; label: string }[] = [];
		for (const provider of providers) {
			for (const [id, model] of Object.entries(provider.models)) {
				list.push({ key: `${provider.id}/${id}`, label: `${provider.name} · ${model.name}` });
			}
		}
		return list;
	}, [providers]);

	const lastAssistant = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "assistant") return messages[i];
		}
		return undefined;
	}, [messages]);
	const lastParts = useMessageParts(lastAssistant?.id);

	const derived = useMemo(() => {
		const model = lastAssistant ? modelKeyOf(lastAssistant) : undefined;
		const agent = lastAssistant ? agentOf(lastAssistant, lastParts) : undefined;
		return {
			modelKey: model && models.some((m) => m.key === model) ? model : "",
			agent: agent && agents.some((a) => a.name === agent) ? agent : "",
		};
	}, [lastAssistant, lastParts, models, agents]);

	// Selecting the last assistant turn's model/agent is the default until the
	// user explicitly picks something (including "Default", which is "").
	const [modelChoice, setModelChoice] = useState<string | null>(null);
	const [agentChoice, setAgentChoice] = useState<string | null>(null);
	const modelKey = modelChoice ?? derived.modelKey;
	const agent = agentChoice ?? derived.agent;

	const submitting = sending || busy;

	async function submit() {
		const trimmed = text.trim();
		if (!trimmed || submitting) return;
		setError(null);
		setSending(true);
		// Clear optimistically: the sync prompt endpoint resolves only after the
		// whole turn finishes, so waiting to clear leaves the text sitting there.
		setText("");
		try {
			const [providerID, ...rest] = modelKey.split("/");
			await prompt({
				parts: [{ type: "text", text: trimmed }],
				model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
				agent: agent || undefined,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			// Restore the failed message unless the user already started typing.
			setText((cur) => (cur ? cur : trimmed));
		} finally {
			setSending(false);
		}
	}

	return (
		<div className={styles.wrap}>
			{error && <div className={styles.error}>{error}</div>}
			<div className={styles.composer}>
				<textarea
					className={styles.input}
					placeholder="Send a message… (Enter to send, Shift+Enter for a new line)"
					value={text}
					rows={3}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void submit();
						}
					}}
				/>
				<div className={styles.bar}>
					<Dropdown
						value={modelKey}
						onChange={setModelChoice}
						title="Model"
						options={[
							{ value: "", label: "Default model" },
							...models.map((m) => ({ value: m.key, label: m.label })),
						]}
					/>
					<Dropdown
						value={agent}
						onChange={setAgentChoice}
						title="Agent"
						options={[
							{ value: "", label: "Default agent" },
							...agents.map((a) => ({ value: a.name, label: a.name })),
						]}
					/>
					<span className="spacer" />
					{busy ? (
						<button type="button" className="btn btn-danger" onClick={() => void abort()}>
							Stop
						</button>
					) : (
						<button
							type="button"
							className="btn btn-primary"
							disabled={!text.trim() || sending}
							onClick={() => void submit()}
						>
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
