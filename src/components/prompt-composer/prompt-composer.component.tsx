import { useMemo, useState } from "react";
import { useAgents, usePrompt, useProviders } from "react-opencode";
import { Dropdown } from "../dropdown/dropdown.component.tsx";
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
					<Dropdown
						value={modelKey}
						onChange={setModelKey}
						title="Model"
						options={[
							{ value: "", label: "Default model" },
							...models.map((m) => ({ value: m.key, label: m.label })),
						]}
					/>
					<Dropdown
						value={agent}
						onChange={setAgent}
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
