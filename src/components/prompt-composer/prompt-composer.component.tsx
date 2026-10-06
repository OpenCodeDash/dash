import { useEffect, useMemo, useRef, useState } from "react";
import {
	useAgents,
	useClientActions,
	useCommands,
	useMessageParts,
	useMessages,
	useOpenCode,
	usePrompt,
	useProviders,
	type Message,
	type Part,
} from "react-opencode";
import { useMessageQueue, type QueuedMessage } from "../../hooks/use-message-queue.ts";
import { compactSession } from "../../server.ts";
import { Dropdown } from "../dropdown/dropdown.component.tsx";
import styles from "./prompt-composer.module.scss";
import { commandQuery, filterCommands, mergeCommands, parseSlashCommand } from "./slash-commands.ts";

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

interface Prefill {
	/** Text to drop into the composer. */
	text: string;
	/** Bumped each time so repeated reverts to the same text still apply. */
	id: number;
}

export function PromptComposer({
	sessionId,
	busy,
	prefill,
}: {
	sessionId: string;
	busy: boolean;
	prefill?: Prefill;
}) {
	const { prompt, abort } = usePrompt(sessionId);
	const client = useOpenCode();
	const { command } = useClientActions();
	const serverCommands = useCommands();
	const commands = useMemo(() => mergeCommands(serverCommands), [serverCommands]);
	const providers = useProviders();
	const agents = useAgents();
	const messages = useMessages(sessionId);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	// Dismissed by Escape until the text changes again, so the menu stays closed
	// while the user keeps editing the same command.
	const [dismissed, setDismissed] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	// Reverting to a message seeds the composer with that message's text so it can
	// be edited and re-sent. The `id` guards against re-applying the same prefill.
	const appliedPrefill = useRef<number | null>(null);

	useEffect(() => {
		if (!prefill || prefill.id === appliedPrefill.current) return;
		appliedPrefill.current = prefill.id;
		setText(prefill.text);
		setDismissed(false);
		setActiveIndex(0);
		inputRef.current?.focus();
	}, [prefill]);

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
	const { queue, enqueue, remove } = useMessageQueue(busy, sendQueued);

	// Slash menu: only while the user is still typing the command name (no
	// whitespace yet). Once arguments start, the menu closes.
	const query = commandQuery(text);
	const matches = useMemo(() => (query === null ? [] : filterCommands(query, commands)), [query, commands]);
	const menuOpen = query !== null && !dismissed && matches.length > 0;
	const active = matches.length ? Math.min(activeIndex, matches.length - 1) : 0;
	// Slash commands are queue-only: steering literal `/compact` as text is wrong.
	const pendingIsCommand = parseSlashCommand(text.trim()) !== null;

	function complete(cmd: { name: string }) {
		setText(`/${cmd.name} `);
		setActiveIndex(0);
	}

	async function dispatch(raw: string, modelKey: string, agent: string): Promise<void> {
		const parsed = parseSlashCommand(raw);
		const compacting = parsed?.name === "compact";
		const serverCommand = parsed && !compacting && commands.some((c) => c.name === parsed.name) ? parsed : null;
		if (compacting) {
			await compactSession(client.url, sessionId);
			return;
		}
		if (serverCommand) {
			await command(sessionId, {
				command: serverCommand.name,
				arguments: serverCommand.arguments,
				agent: agent || undefined,
				model: modelKey || undefined,
			});
			return;
		}
		const [providerID, ...rest] = modelKey.split("/");
		await prompt({
			parts: [{ type: "text", text: raw }],
			model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
			agent: agent || undefined,
		});
	}

	// Flushing a queued message uses the same blocking send as a normal turn, so
	// the queue's FIFO order is preserved by the hook.
	async function sendQueued(message: QueuedMessage) {
		setError(null);
		try {
			await dispatch(message.text, message.modelKey, message.agent);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			throw e;
		}
	}

	// Queue the current input; it runs after the active turn finishes.
	function queueMessage() {
		const trimmed = text.trim();
		if (!trimmed || !busy) return;
		setError(null);
		enqueue({ text: trimmed, modelKey, agent });
		setText("");
	}

	// Steer the active turn now via the async endpoint. The running loop absorbs
	// the message at its next safe boundary. Slash commands are queue-only.
	async function steer() {
		const trimmed = text.trim();
		if (!trimmed || !busy || parseSlashCommand(trimmed)) return;
		setError(null);
		setText("");
		try {
			const [providerID, ...rest] = modelKey.split("/");
			await client.promptAsync(sessionId, {
				parts: [{ type: "text", text: trimmed }],
				model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
				agent: agent || undefined,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setText((cur) => (cur ? cur : trimmed));
		}
	}

	async function submit() {
		const trimmed = text.trim();
		if (!trimmed || submitting) return;
		setError(null);
		setSending(true);
		// Clear optimistically: the sync prompt endpoint resolves only after the
		// whole turn finishes, so waiting to clear leaves the text sitting there.
		setText("");
		try {
			await dispatch(trimmed, modelKey, agent);
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
			{queue.length > 0 && (
				<div className={styles.queue}>
					<div className={styles.queueHeader}>Queued ({queue.length})</div>
					{queue.map((message) => (
						<div key={message.id} className={styles.queueItem}>
							<span className={styles.queueText}>{message.text}</span>
							<button
								type="button"
								className={styles.queueRemove}
								title="Remove from queue"
								aria-label="Remove queued message"
								onClick={() => remove(message.id)}
							>
								✕
							</button>
						</div>
					))}
				</div>
			)}
			<div className={styles.composer}>
				<textarea
					ref={inputRef}
					className={styles.input}
					placeholder={
						busy
							? "Queue or steer a message… (Shift+Enter for a new line, / for commands)"
							: "Send a message… (Enter to send, Shift+Enter for a new line, / for commands)"
					}
					value={text}
					rows={3}
					onChange={(e) => {
						setText(e.target.value);
						setDismissed(false);
						setActiveIndex(0);
					}}
					onKeyDown={(e) => {
						if (menuOpen) {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setActiveIndex((i) => (i + 1) % matches.length);
								return;
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
								return;
							}
							if (e.key === "Tab") {
								e.preventDefault();
								complete(matches[active]);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								setDismissed(true);
								return;
							}
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (matches[active].name === query) void submit();
								else complete(matches[active]);
								return;
							}
						}
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void submit();
						}
					}}
				/>
				{menuOpen && (
					<div className={styles.slashMenu} role="listbox" aria-label="Commands">
						{matches.map((cmd, i) => (
							<button
								key={cmd.name}
								type="button"
								role="option"
								aria-selected={i === active}
								className={`${styles.slashItem} ${i === active ? styles.slashItemActive : ""}`}
								onMouseEnter={() => setActiveIndex(i)}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => {
									complete(cmd);
									inputRef.current?.focus();
								}}
							>
								<span className={styles.slashName}>/{cmd.name}</span>
								{cmd.description && <span className={styles.slashDesc}>{cmd.description}</span>}
							</button>
						))}
					</div>
				)}
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
						<>
							<button
								type="button"
								className="btn"
								disabled={!text.trim()}
								onClick={queueMessage}
								title="Run after the current turn finishes"
							>
								Queue
							</button>
							<button
								type="button"
								className="btn btn-primary"
								disabled={!text.trim() || pendingIsCommand}
								onClick={() => void steer()}
								title={pendingIsCommand ? "Commands can only be queued" : "Send into the running turn now"}
							>
								Steer
							</button>
							<button type="button" className="btn btn-danger" onClick={() => void abort()}>
								Stop
							</button>
						</>
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
