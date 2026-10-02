import { useState } from "react";
import { useClientActions, useTags, type Tag } from "react-backdash";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./tag-manager.module.scss";

interface TagManagerProps {
	boardId: string;
	open: boolean;
	onClose: () => void;
}

export function TagManager({ boardId, open, onClose }: TagManagerProps) {
	const { createTag, updateTag, deleteTag } = useClientActions();
	const tags = useTags(boardId);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [prompt, setPrompt] = useState("");
	const [color, setColor] = useState("");

	function reset() {
		setEditingId(null);
		setName("");
		setDescription("");
		setPrompt("");
		setColor("");
	}

	function load(tag: Tag) {
		setEditingId(tag.id);
		setName(tag.name);
		setDescription(tag.description ?? "");
		setPrompt(tag.prompt ?? "");
		setColor(tag.color ?? "");
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		const payload = {
			name: trimmed,
			description: description.trim() || null,
			prompt: prompt.trim() || null,
			color: color.trim() || null,
		};

		if (editingId === null) {
			void createTag(boardId, payload).then(reset).catch(() => undefined);
		} else {
			void updateTag(boardId, editingId, payload).then(reset).catch(() => undefined);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Tags" maxWidth={560}>
			<div className={styles.body}>
				<div className={styles.list}>
					{tags.length === 0 && <p className={styles.empty}>No tags yet. Add one below.</p>}
					{tags.map((tag) => (
						<div
							key={tag.id}
							className={`${styles.row} ${editingId === tag.id ? styles.rowActive : ""}`}
						>
							<button type="button" className={styles.rowMain} onClick={() => load(tag)}>
								<span
									className={styles.swatch}
									style={tag.color ? { background: tag.color } : undefined}
								/>
								<span className={styles.rowName}>{tag.name}</span>
								{tag.description && <span className={styles.rowDesc}>{tag.description}</span>}
							</button>
							<button
								type="button"
								className="icon-btn"
								title="Delete tag"
								onClick={() => void deleteTag(boardId, tag.id).catch(() => undefined)}
							>
								✕
							</button>
						</div>
					))}
				</div>

				<form className={styles.form} onSubmit={submit}>
					<h3 className={styles.formTitle}>{editingId === null ? "New tag" : "Edit tag"}</h3>
					<label className={styles.field}>
						<span className={styles.label}>Name</span>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="frontend"
							aria-label="Tag name"
						/>
					</label>
					<label className={styles.field}>
						<span className={styles.label}>Description</span>
						<input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What this tag means"
							aria-label="Tag description"
						/>
					</label>
					<label className={styles.field}>
						<span className={styles.label}>Prompt</span>
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="Instructions injected when an agent runs a tagged task"
							rows={3}
							aria-label="Tag prompt"
						/>
					</label>
					<label className={styles.field}>
						<span className={styles.label}>Color</span>
						<span className={styles.colorRow}>
							<input
								className={styles.color}
								type="color"
								value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#6c9ef8"}
								onChange={(e) => setColor(e.target.value)}
								aria-label="Tag color"
							/>
							<input
								value={color}
								onChange={(e) => setColor(e.target.value)}
								placeholder="#6c9ef8"
								aria-label="Tag color hex"
							/>
							{color && (
								<button type="button" className="btn btn-ghost" onClick={() => setColor("")}>
									Clear
								</button>
							)}
						</span>
					</label>
					<div className={styles.actions}>
						{editingId !== null && (
							<button type="button" className="btn btn-ghost" onClick={reset}>
								Cancel
							</button>
						)}
						<button type="submit" className="btn btn-primary" disabled={!name.trim()}>
							{editingId === null ? "Add tag" : "Save"}
						</button>
					</div>
				</form>
			</div>
		</Modal>
	);
}
