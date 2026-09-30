import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClientActions, type BoardSummary } from "react-backdash";
import styles from "./board-item.module.scss";

export function BoardItem({ board }: { board: BoardSummary }) {
	const { renameBoard, deleteBoard } = useClientActions();
	const navigate = useNavigate();
	const location = useLocation();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");
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

	function remove() {
		if (window.confirm(`Delete board "${board.name}"? This removes its columns.`)) {
			void deleteBoard(board.id)
				.then(() => {
					if (active) navigate("/boards");
				})
				.catch(() => undefined);
		}
	}

	return (
		<div
			className={`${styles.item} ${active ? styles.active : ""}`}
			onClick={() => navigate(`/boards/${board.id}`)}
		>
			{renaming ? (
				<input
					className={styles.rename}
					value={title}
					autoFocus
					onClick={(e) => e.stopPropagation()}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={commitRename}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitRename();
						if (e.key === "Escape") setRenaming(false);
					}}
				/>
			) : (
				<span className={styles.title} onDoubleClick={startRename} title="Double-click to rename">
					{board.name}
				</span>
			)}
			<button
				type="button"
				className="icon-btn"
				title="Delete board"
				onClick={(e) => {
					e.stopPropagation();
					remove();
				}}
			>
				✕
			</button>
		</div>
	);
}
