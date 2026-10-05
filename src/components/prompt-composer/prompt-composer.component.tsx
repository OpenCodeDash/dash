import { useMemo, useRef, useState } from "react";
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

export function PromptComposer({ sessionId, busy }: { sessionId: string; busy: boolean }) {
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

	// Slash menu: only while the user is still typing the command name (no
	// whitespace yet). Once arguments start, the menu closes.
	const query = commandQuery(text);
	const matches = useMemo(() => (query === null ? [] : filterCommands(query, commands)), [query, commands]);
	const menuOpen = query !== null && !dismissed && matches.length > 0;
	const active = matches.length ? Math.min(activeIndex, matches.length - 1) : 0;

	function complete(cmd: { name: string }) {
		setText(`/${cmd.name} `);
		setActiveIndex(0);
	}

	async function submit() {
		const trimmed = text.trim();
		if (!trimmed || submitting) return;
		const parsed = parseSlashCommand(trimmed);
		const compacting = parsed?.name === "compact";
		const serverCommand = parsed && !compacting && commands.some((c) => c.name === parsed.name) ? parsed : null;
		setError(null);
		setSending(true);
		// Clear optimistically: the sync prompt endpoint resolves only after the
		// whole turn finishes, so waiting to clear leaves the text sitting there.
		setText("");
		try {
			if (compacting) {
				await compactSession(client.url, sessionId);
			} else if (serverCommand) {
				await command(sessionId, {
					command: serverCommand.name,
					arguments: serverCommand.arguments,
					agent: agent || undefined,
					model: modelKey || undefined,
				});
			} else {
				const [providerID, ...rest] = modelKey.split("/");
				await prompt({
					parts: [{ type: "text", text: trimmed }],
					model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
					agent: agent || undefined,
				});
			}
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
					ref={inputRef}
					className={styles.input}
					placeholder="Send a message… (Enter to send, Shift+Enter for a new line, / for commands)"
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
