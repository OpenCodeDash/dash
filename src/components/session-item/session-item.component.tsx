import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientActions, useSessionBusy, type Session } from "react-opencode";
import { ConfirmDialog } from "../confirm-dialog/confirm-dialog.component.tsx";
import styles from "./session-item.module.scss";

export function SessionItem({ session, nested = false }: { session: Session; nested?: boolean }) {
	const busy = useSessionBusy(session.id);
	const { renameSession, deleteSession } = useClientActions();
	const navigate = useNavigate();
	const location = useLocation();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");
	const [confirming, setConfirming] = useState(false);
	const active = location.pathname === `/session/${session.id}`;

	function startRename() {
		setTitle(session.title ?? "");
		setRenaming(true);
	}

	function commitRename() {
		setRenaming(false);
		const trimmed = title.trim();
		if (trimmed && trimmed !== session.title) {
			void renameSession(session.id, trimmed).catch(() => undefined);
		}
	}

	function confirmDelete() {
		setConfirming(false);
		void deleteSession(session.id)
			.then(() => {
				if (active) navigate("/");
			})
			.catch(() => undefined);
	}

	const leading = (
		<>
			{busy && <span className={styles.busy} title="Busy" />}
			{nested && !renaming && (
				<span className={styles.branch} title="Subagent" aria-hidden="true">
					↳
				</span>
			)}
		</>
	);

	return (
		<>
			<div
				className={`${styles.item} ${active ? styles.active : ""} ${nested ? styles.nested : ""}`}
				data-session-id={session.id}
			>
				{renaming ? (
					<span className={styles.main}>
						{leading}
						<input
							className={styles.rename}
							value={title}
							autoFocus
							onChange={(e) => setTitle(e.target.value)}
							onBlur={commitRename}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitRename();
								if (e.key === "Escape") setRenaming(false);
							}}
						/>
					</span>
				) : (
					<Link to={`/session/${session.id}`} className={styles.main}>
						{leading}
						<span
							className={styles.title}
							onDoubleClick={startRename}
							title="Double-click to rename"
						>
							{session.title ?? "New session"}
						</span>
					</Link>
				)}
				<button
					type="button"
					className="icon-btn"
					title="Delete session"
					onClick={() => setConfirming(true)}
				>
					✕
				</button>
			</div>
			<ConfirmDialog
				open={confirming}
				title="Delete session"
				message={`Delete session "${session.title ?? "New session"}"?`}
				confirmLabel="Delete"
				danger
				onConfirm={confirmDelete}
				onCancel={() => setConfirming(false)}
			/>
		</>
	);
}
