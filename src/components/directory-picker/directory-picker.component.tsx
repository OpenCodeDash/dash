import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSessionInDirectory, fetchPath, listDirectories, OPENCODE_URL, type DirEntry } from "../../server.ts";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./directory-picker.module.scss";

interface DirectoryPickerProps {
	open: boolean;
	onClose: () => void;
}

function parentOf(dir: string): string {
	const clean = dir.replace(/\/+$/, "");
	if (clean === "" || clean === "/") return "/";
	const idx = clean.lastIndexOf("/");
	return idx <= 0 ? "/" : clean.slice(0, idx);
}

function normalize(dir: string): string {
	const d = dir.trim();
	if (!d) return "/";
	return d.startsWith("/") ? d : `/${d}`;
}

export function DirectoryPicker({ open, onClose }: DirectoryPickerProps) {
	const navigate = useNavigate();
	const [cwd, setCwd] = useState("/");
	const [pathInput, setPathInput] = useState("/");
	const [entries, setEntries] = useState<DirEntry[]>([]);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Which directory the current `entries` describe. When it lags behind `cwd`
	// (while a listing is in flight) the panel shows its busy state.
	const [loadedDir, setLoadedDir] = useState<string | null>(null);
	const busy = open && loadedDir !== cwd;

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		fetchPath(OPENCODE_URL)
			.then((p) => {
				if (cancelled) return;
				const start = p.home || p.cwd || p.directory || "/";
				setCwd(start);
				setPathInput(start);
			})
			.catch(() => {
				if (cancelled) return;
				setCwd("/");
				setPathInput("/");
			});
		return () => {
			cancelled = true;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		listDirectories(OPENCODE_URL, cwd)
			.then((list) => {
				if (cancelled) return;
				setEntries(list);
				setError(null);
			})
			.catch((e) => {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			})
			.finally(() => {
				if (!cancelled) setLoadedDir(cwd);
			});
		return () => {
			cancelled = true;
		};
	}, [open, cwd]);

	function enter(dir: string) {
		const d = normalize(dir);
		setCwd(d);
		setPathInput(d);
	}

	function create() {
		setCreating(true);
		setError(null);
		createSessionInDirectory(OPENCODE_URL, cwd)
			.then((s) => {
				onClose();
				navigate(`/session/${s.id}`);
			})
			.catch((e) => setError(e instanceof Error ? e.message : String(e)))
			.finally(() => setCreating(false));
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="New session — choose directory"
			maxWidth={600}
			footer={
				<>
					<span className={styles.footerPath} title={cwd}>
						{cwd}
					</span>
					<button type="button" className="btn btn-primary" disabled={creating || busy} onClick={create}>
						{creating ? "Creating…" : "Create session here"}
					</button>
				</>
			}
		>
			<div className={styles.pathRow}>
				<input
					className={styles.pathInput}
					value={pathInput}
					onChange={(e) => setPathInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") enter(pathInput);
					}}
					spellCheck={false}
					aria-label="Directory path"
				/>
				<button type="button" className="btn" onClick={() => enter(pathInput)}>
					Go
				</button>
			</div>

			{error && <div className={styles.error}>{error}</div>}

			<div className={styles.list}>
				{cwd !== "/" && (
					<button type="button" className={styles.entry} onClick={() => enter(parentOf(cwd))}>
						<span className={styles.icon}>↑</span>
						<span className={styles.name}>Parent directory</span>
					</button>
				)}
				{busy && <div className={styles.hint}>Loading…</div>}
				{!busy && entries.length === 0 && !error && <div className={styles.hint}>No subdirectories.</div>}
				{entries.map((e) => (
					<button key={e.path} type="button" className={styles.entry} onClick={() => enter(e.absolute)}>
						<span className={styles.icon}>▸</span>
						<span className={styles.name} title={e.absolute}>
							{e.name}
						</span>
					</button>
				))}
			</div>
		</Modal>
	);
}
