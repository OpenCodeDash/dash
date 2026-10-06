import { useCallback, useEffect, useState } from "react";
import { useFileStatus, useOpenCode } from "react-opencode";
import styles from "./file-diff-panel.module.scss";

interface DiffFile {
	file: string;
	text: string;
}

interface DiffState {
	files: DiffFile[];
	fallback: string | null;
	error: string | null;
	forSession: string | null;
	loading: boolean;
}

function normalizeDiff(raw: unknown): DiffFile[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null && "file" in d)
			.map((d) => ({
				file: String(d.file),
				text:
					typeof d.patch === "string"
						? d.patch
						: typeof d.diff === "string"
							? d.diff
							: JSON.stringify(d, null, 2),
			}));
	}
	if (raw && typeof raw === "object") {
		return Object.entries(raw as Record<string, unknown>).map(([file, value]) => ({
			file,
			text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
		}));
	}
	return [];
}

export function DiffText({ text }: { text: string }) {
	return (
		<pre className={styles.diff}>
			{text.split("\n").map((line, i) => {
				let cls = styles.diffLine;
				if (line.startsWith("@@")) cls = styles.diffHunk;
				else if (line.startsWith("+")) cls = styles.diffAdd;
				else if (line.startsWith("-")) cls = styles.diffDel;
				return (
					<span key={i} className={cls}>
						{line}
						{"\n"}
					</span>
				);
			})}
		</pre>
	);
}

const TYPE_LABEL: Record<string, string> = {
	added: "A",
	modified: "M",
	deleted: "D",
	renamed: "R",
};

export function FileDiffPanel({ sessionId }: { sessionId: string }) {
	const client = useOpenCode();
	const fileStatus = useFileStatus();
	const [diff, setDiff] = useState<DiffState>({
		files: [],
		fallback: null,
		error: null,
		forSession: null,
		loading: false,
	});
	const [selected, setSelected] = useState<string | null>(null);
	const loading = diff.loading || diff.forSession !== sessionId;

	const load = useCallback(() => {
		void Promise.all([client.fileStatus().catch(() => []), client.sessionDiff(sessionId).catch(() => null)]).then(
			([status, rawDiff]) => {
				client.store.setFileStatus(status);
				const files = normalizeDiff(rawDiff);
				setDiff({
					files,
					fallback: files.length === 0 && rawDiff != null ? JSON.stringify(rawDiff, null, 2) : null,
					error: null,
					forSession: sessionId,
					loading: false,
				});
			},
			(e) =>
				setDiff((s) => ({
					...s,
					error: e instanceof Error ? e.message : String(e),
					forSession: sessionId,
					loading: false,
				})),
		);
	}, [client, sessionId]);

	useEffect(() => {
		load();
	}, [load]);

	const activeFile = diff.files.find((f) => f.file === selected) ?? null;

	return (
		<aside className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Files</h2>
				<button type="button" className="btn btn-ghost" title="Refresh" onClick={load}>
					{loading ? "…" : "↻"}
				</button>
			</div>
			{diff.error && <div className="panel-error">{diff.error}</div>}
			<div className={styles.files}>
				{fileStatus.map((entry) => {
					const hasDiff = diff.files.some((f) => f.file === entry.file);
					return (
						<button
							key={entry.file}
							type="button"
							className={`${styles.fileRow} ${hasDiff ? "" : styles.fileRowPlain}`}
							onClick={() => hasDiff && setSelected(entry.file)}
						>
							<span className={`${styles.fileType} ${styles[`fileType_${entry.type}`]}`}>
								{TYPE_LABEL[entry.type] ?? "?"}
							</span>
							<span className={styles.fileName} title={entry.file}>
								{entry.file}
							</span>
							<span className={styles.fileCounts}>
								{entry.additions > 0 && <em className={styles.add}>+{entry.additions}</em>}
								{entry.deletions > 0 && <em className={styles.del}>−{entry.deletions}</em>}
							</span>
						</button>
					);
				})}
				{fileStatus.length === 0 && <p className="panel-empty">No changed files.</p>}
			</div>
			<div className={styles.diffArea}>
				{activeFile ? (
					<>
						<div className={styles.diffFile} title={activeFile.file}>
							{activeFile.file}
						</div>
						<DiffText text={activeFile.text} />
					</>
				) : diff.fallback ? (
					<pre className={styles.diff}>{diff.fallback}</pre>
				) : (
					<p className="panel-empty">Select a file to see its diff.</p>
				)}
			</div>
		</aside>
	);
}
