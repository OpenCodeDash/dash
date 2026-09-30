import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBoards, useClientActions, type BoardSummary } from "react-backdash";
import styles from "./boards-page.module.scss";

function BoardRow({ board }: { board: BoardSummary }) {
	const { renameBoard, deleteBoard } = useClientActions();
	const navigate = useNavigate();
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState("");

	function commitRename() {
		setRenaming(false);
		const trimmed = title.trim();
		if (trimmed && trimmed !== board.name) {
			void renameBoard(board.id, trimmed).catch(() => undefined);
		}
	}

	function remove() {
		if (window.confirm(`Delete board "${board.name}"? This removes its columns.`)) {
			void deleteBoard(board.id).catch(() => undefined);
		}
	}

	return (
		<div className={styles.row} onClick={() => navigate(`/boards/${board.id}`)}>
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
				<span
					className={styles.name}
					onDoubleClick={() => {
						setTitle(board.name);
						setRenaming(true);
					}}
					title="Double-click to rename"
				>
					{board.name}
				</span>
			)}
			<button
				type="button"
				className="btn btn-ghost"
				onClick={(e) => {
					e.stopPropagation();
					navigate(`/boards/${board.id}`);
				}}
			>
				Open
			</button>
			<button type="button" className="icon-btn" title="Delete board" onClick={(e) => { e.stopPropagation(); remove(); }}>
				✕
			</button>
		</div>
	);
}

export function BoardsPage() {
	const boards = useBoards();
	const { createBoard } = useClientActions();
	const [name, setName] = useState("");

	function create(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setName("");
		void createBoard(trimmed).catch(() => undefined);
	}

	return (
		<div className={styles.page}>
			<div className={styles.inner}>
				<h1>Boards</h1>
				<form className={styles.create} onSubmit={create}>
					<input
						value={name}
						placeholder="New board name"
						onChange={(e) => setName(e.target.value)}
						aria-label="New board name"
					/>
					<button type="submit" className="btn btn-primary" disabled={!name.trim()}>
						Create
					</button>
				</form>
				{boards.length === 0 ? (
					<div className={styles.empty}>No boards yet. Create one above.</div>
				) : (
					<div className={styles.list}>
						{boards.map((board) => (
							<BoardRow key={board.id} board={board} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
