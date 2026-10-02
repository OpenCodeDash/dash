import { useMemo, useState } from "react";
import { useAgents, usePrompt, useProviders } from "react-opencode";
import styles from "./prompt-composer.module.scss";

export function PromptComposer({ sessionId, busy }: { sessionId: string; busy: boolean }) {
	const { prompt, abort } = usePrompt(sessionId);
	const providers = useProviders();
	const agents = useAgents();
	const [text, setText] = useState("");
	const [modelKey, setModelKey] = useState("");
	const [agent, setAgent] = useState("");
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
					<select className="select" value={modelKey} onChange={(e) => setModelKey(e.target.value)} title="Model">
						<option value="">Default model</option>
						{models.map((m) => (
							<option key={m.key} value={m.key}>
								{m.label}
							</option>
						))}
					</select>
					<select className="select" value={agent} onChange={(e) => setAgent(e.target.value)} title="Agent">
						<option value="">Default agent</option>
						{agents.map((a) => (
							<option key={a.name} value={a.name}>
								{a.name}
							</option>
						))}
					</select>
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
