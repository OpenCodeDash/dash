import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientActions, type BoardSummary } from "react-backdash";
import { ConfirmDialog } from "../confirm-dialog/confirm-dialog.component.tsx";
import styles from "./board-item.module.scss";

export function BoardItem({ board }: { board: BoardSummary }) {
	const { renameBoard, deleteBoard } = useClientActions();
	const navigate = useNavigate();
	const location = useLocation();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");
	const [confirming, setConfirming] = useState(false);
	const active =
		location.pathname === `/boards/${board.id}` || location.pathname === `/boards/${board.id}/`;

	function startRename() {
		setTitle(board.name);
		setRenaming(true);
	}

	function commitRename() {
		setRenaming(false);
		const trimmed = title.trim();
		if (trimmed && trimmed !== board.name) {
			void renameBoard(board.id, trimmed).catch(() => undefined);
		}
	}

	function confirmDelete() {
		setConfirming(false);
		void deleteBoard(board.id)
			.then(() => {
				if (active) navigate("/boards");
			})
			.catch(() => undefined);
	}

	return (
		<>
			<div className={`${styles.item} ${active ? styles.active : ""}`} data-board-id={board.id}>
				{renaming ? (
					<span className={styles.main}>
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
					<Link to={`/boards/${board.id}`} className={styles.main}>
						<span
							className={styles.title}
							onDoubleClick={startRename}
							title="Double-click to rename"
						>
							{board.name}
						</span>
					</Link>
				)}
				<button
					type="button"
					className="icon-btn"
					title="Delete board"
					onClick={() => setConfirming(true)}
				>
					✕
				</button>
			</div>
			<ConfirmDialog
				open={confirming}
				title="Delete board"
				message={`Delete board "${board.name}"? This removes its columns.`}
				confirmLabel="Delete"
				danger
				onConfirm={confirmDelete}
				onCancel={() => setConfirming(false)}
			/>
		</>
	);
}
