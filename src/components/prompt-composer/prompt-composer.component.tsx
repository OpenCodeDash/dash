import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ClipboardEvent,
	type DragEvent,
} from "react";
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
	type PartInput,
} from "react-opencode";
import { useMessageQueue, type QueuedMessage } from "../../hooks/use-message-queue.ts";
import { compactSession } from "../../server.ts";
import { Dropdown } from "../dropdown/dropdown.component.tsx";
import {
	formatBytes,
	isImageAttachment,
	prepareAttachments,
	type Attachment,
} from "./attachments.ts";
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

function toFileParts(attachments: Attachment[]): PartInput[] {
	return attachments.map((attachment) => ({
		type: "file",
		url: attachment.dataUrl,
		mime: attachment.mime,
		filename: attachment.name,
	}));
}

/** Text first, then files, so the instruction reads before its attachments. */
function partsFor(text: string, attachments: Attachment[]): PartInput[] {
	const parts = toFileParts(attachments);
	if (text) parts.unshift({ type: "text", text });
	return parts;
}

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) return "FILE";
	return name.slice(dot + 1).slice(0, 4).toUpperCase();
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
	const [attachError, setAttachError] = useState<string | null>(null);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const [sending, setSending] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	// Dismissed by Escape until the text changes again, so the menu stays closed
	// while the user keeps editing the same command.
	const [dismissed, setDismissed] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Separate picker with `capture` so mobile can open the camera directly.
	const cameraInputRef = useRef<HTMLInputElement>(null);
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
	const hasInput = text.trim().length > 0 || attachments.length > 0;
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

	async function addFiles(files: File[] | FileList | null) {
		const list = files ? Array.from(files) : [];
		if (!list.length) return;
		setAttachError(null);
		const existingBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);
		const prepared = await prepareAttachments(list, existingBytes);
		if (prepared.attachments.length) {
			setAttachments((current) => [...current, ...prepared.attachments]);
		}
		if (prepared.errors.length) setAttachError(prepared.errors.join(" "));
	}

	function removeAttachment(id: string) {
		setAttachments((current) => current.filter((attachment) => attachment.id !== id));
	}

	function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const files: File[] = [];
		for (const item of Array.from(event.clipboardData.items)) {
			if (item.kind !== "file") continue;
			const file = item.getAsFile();
			if (file) files.push(file);
		}
		if (!files.length) return;
		event.preventDefault();
		void addFiles(files);
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		if (!event.dataTransfer.files.length) return;
		event.preventDefault();
		setDragOver(false);
		void addFiles(event.dataTransfer.files);
	}

	async function dispatch(
		raw: string,
		modelKey: string,
		agent: string,
		files: Attachment[],
	): Promise<void> {
		const parsed = parseSlashCommand(raw);
		const compacting = parsed?.name === "compact";
		const serverCommand = parsed && !compacting && commands.some((c) => c.name === parsed.name) ? parsed : null;
		if (compacting) {
			if (files.length) throw new Error("Attachments can't be used with /compact.");
			await compactSession(client.url, sessionId);
			return;
		}
		if (serverCommand) {
			const fileParts = toFileParts(files);
			await command(sessionId, {
				command: serverCommand.name,
				arguments: serverCommand.arguments,
				agent: agent || undefined,
				model: modelKey || undefined,
				parts: fileParts.length ? fileParts : undefined,
			});
			return;
		}
		const [providerID, ...rest] = modelKey.split("/");
		await prompt({
			parts: partsFor(raw, files),
			model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
			agent: agent || undefined,
		});
	}

	// Flushing a queued message uses the same blocking send as a normal turn, so
	// the queue's FIFO order is preserved by the hook.
	async function sendQueued(message: QueuedMessage) {
		setError(null);
		try {
			await dispatch(message.text, message.modelKey, message.agent, message.attachments);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			throw e;
		}
	}

	// Queue the current input; it runs after the active turn finishes.
	function queueMessage() {
		const trimmed = text.trim();
		if ((!trimmed && attachments.length === 0) || !busy) return;
		setError(null);
		enqueue({ text: trimmed, attachments, modelKey, agent });
		setText("");
		setAttachments([]);
	}

	// Steer the active turn now via the async endpoint. The running loop absorbs
	// the message at its next safe boundary. Slash commands are queue-only.
	async function steer() {
		const trimmed = text.trim();
		if ((!trimmed && attachments.length === 0) || !busy || parseSlashCommand(trimmed)) return;
		const files = attachments;
		setError(null);
		setText("");
		setAttachments([]);
		try {
			const [providerID, ...rest] = modelKey.split("/");
			await client.promptAsync(sessionId, {
				parts: partsFor(trimmed, files),
				model: modelKey ? { providerID, modelID: rest.join("/") } : undefined,
				agent: agent || undefined,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setText((cur) => (cur ? cur : trimmed));
			setAttachments((cur) => (cur.length ? cur : files));
		}
	}

	async function submit() {
		const trimmed = text.trim();
		if ((!trimmed && attachments.length === 0) || submitting) return;
		const files = attachments;
		setError(null);
		setSending(true);
		// Clear optimistically: the sync prompt endpoint resolves only after the
		// whole turn finishes, so waiting to clear leaves the text sitting there.
		setText("");
		setAttachments([]);
		try {
			await dispatch(trimmed, modelKey, agent, files);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			// Restore the failed message unless the user already started typing.
			setText((cur) => (cur ? cur : trimmed));
			setAttachments((cur) => (cur.length ? cur : files));
		} finally {
			setSending(false);
		}
	}

	return (
		<div className={styles.wrap}>
			{error && (
				<div className={styles.error} role="alert">
					{error}
				</div>
			)}
			{attachError && (
				<div className={styles.error} role="alert">
					{attachError}
				</div>
			)}
			{queue.length > 0 && (
				<div className={styles.queue}>
					<div className={styles.queueHeader}>Queued ({queue.length})</div>
					{queue.map((message) => (
						<div key={message.id} className={styles.queueItem}>
							<span className={styles.queueText}>
								{message.text || message.attachments.map((attachment) => attachment.name).join(", ")}
							</span>
							{message.attachments.length > 0 && (
								<span className={styles.queueFiles}>
									{message.attachments.length} file{message.attachments.length === 1 ? "" : "s"}
								</span>
							)}
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
			<div
				className={`${styles.composer} ${dragOver ? styles.dragOver : ""}`}
				onDragOver={(event) => {
					if (!Array.from(event.dataTransfer.types).includes("Files")) return;
					event.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={(event) => {
					if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
					setDragOver(false);
				}}
				onDrop={handleDrop}
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					hidden
					accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,text/*,application/pdf,application/json,application/xml,application/yaml,application/x-yaml,.md,.txt,.csv,.log,.json,.yaml,.yml"
					onChange={(event) => {
						const files = event.currentTarget.files;
						event.currentTarget.value = "";
						void addFiles(files);
					}}
				/>
				<input
					ref={cameraInputRef}
					type="file"
					accept="image/*"
					capture="environment"
					hidden
					onChange={(event) => {
						const files = event.currentTarget.files;
						event.currentTarget.value = "";
						void addFiles(files);
					}}
				/>
				{attachments.length > 0 && (
					<div className={styles.attachments} aria-label="Attachments">
						{attachments.map((attachment) => (
							<div
								key={attachment.id}
								className={styles.attachment}
								title={`${attachment.name} · ${formatBytes(attachment.size)}`}
							>
								{isImageAttachment(attachment) ? (
									<img className={styles.attachmentThumb} src={attachment.dataUrl} alt={attachment.name} />
								) : (
									<span className={styles.attachmentExt} aria-hidden="true">
										{extensionOf(attachment.name)}
									</span>
								)}
								<span className={styles.attachmentInfo}>
									<span className={styles.attachmentName}>{attachment.name}</span>
									<span className={styles.attachmentSize}>{formatBytes(attachment.size)}</span>
								</span>
								<button
									type="button"
									className={styles.attachmentRemove}
									title="Remove attachment"
									aria-label={`Remove ${attachment.name}`}
									onClick={() => removeAttachment(attachment.id)}
								>
									✕
								</button>
							</div>
						))}
					</div>
				)}
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
					onPaste={handlePaste}
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
					<button
						type="button"
						className="btn btn-ghost"
						onClick={() => fileInputRef.current?.click()}
						title="Attach files, images, or PDFs"
					>
						Attach
					</button>
					<button
						type="button"
						className={`btn btn-ghost ${styles.cameraButton}`}
						onClick={() => cameraInputRef.current?.click()}
						title="Take a photo"
					>
						Camera
					</button>
					<span className="spacer" />
					{busy ? (
						<>
							<button
								type="button"
								className="btn"
								disabled={!hasInput}
								onClick={queueMessage}
								title="Run after the current turn finishes"
							>
								Queue
							</button>
							<button
								type="button"
								className="btn btn-primary"
								disabled={!hasInput || pendingIsCommand}
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
							disabled={!hasInput || sending}
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
