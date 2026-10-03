import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBoards, useClientActions } from "react-backdash";
import { useConnected, useSessions, type Session } from "react-opencode";
import { useTheme } from "../../hooks/use-theme.ts";
import { BoardItem } from "../board-item/board-item.component.tsx";
import { PromptDialog } from "../prompt-dialog/prompt-dialog.component.tsx";
import { SessionGroup } from "../session-group/session-group.component.tsx";
import { SessionItem } from "../session-item/session-item.component.tsx";
import styles from "./sidebar.module.scss";

interface SidebarProps {
	open: boolean;
	onNewSession: () => void;
	onShowServer: () => void;
	onSignOut: () => void;
}

interface Group {
	directory: string;
	sessions: Session[];
	roots: Session[];
	childrenByParent: Map<string, Session[]>;
	orphans: Session[];
}

const byUpdatedDesc = (a: Session, b: Session) => (b.time.updated ?? 0) - (a.time.updated ?? 0);
const newest = (g: Group) => g.sessions.reduce((max, s) => Math.max(max, s.time.updated ?? 0), 0);

export function Sidebar({ open, onNewSession, onShowServer, onSignOut }: SidebarProps) {
	const sessions = useSessions();
	const connected = useConnected();
	const boards = useBoards();
	const { createBoard } = useClientActions();
	const navigate = useNavigate();
	const { theme, toggleTheme } = useTheme();
	const [creatingBoard, setCreatingBoard] = useState(false);

	function createBoardFromPrompt(name: string) {
		setCreatingBoard(false);
		void createBoard(name)
			.then(() => navigate("/boards"))
			.catch(() => undefined);
	}

	const groups = useMemo<Group[]>(() => {
		const byDir = new Map<string, Session[]>();
		for (const s of sessions) {
			const key = s.directory || "/";
			const arr = byDir.get(key) ?? [];
			arr.push(s);
			byDir.set(key, arr);
		}
		const result: Group[] = [];
		for (const [directory, list] of byDir.entries()) {
			const roots = list.filter((s) => !s.parentID).sort(byUpdatedDesc);
			const childrenByParent = new Map<string, Session[]>();
			const orphans: Session[] = [];
			for (const c of list.filter((s) => s.parentID).sort(byUpdatedDesc)) {
				const pid = c.parentID;
				if (pid && roots.some((r) => r.id === pid)) {
					const arr = childrenByParent.get(pid) ?? [];
					arr.push(c);
					childrenByParent.set(pid, arr);
				} else {
					orphans.push(c);
				}
			}
			result.push({ directory, sessions: list, roots, childrenByParent, orphans });
		}
		return result.sort((a, b) => newest(b) - newest(a));
	}, [sessions]);

	return (
		<aside className={`${styles.sidebar} ${open ? styles.open : ""}`}>
			<div className={styles.header}>
				<span
					className={`status-dot ${connected ? "status-dot-on" : "status-dot-pending"}`}
					title={connected ? "Connected" : "Connecting…"}
				/>
				<span className={styles.title}>Sessions</span>
				<button type="button" className="btn btn-ghost" title="New session" onClick={onNewSession}>
					+ New
				</button>
			</div>
			<nav className={styles.list}>
				{groups.map((group) => (
					<SessionGroup
						key={group.directory}
						directory={group.directory}
						sessions={group.sessions}
					>
						{group.roots.map((root) => (
							<Fragment key={root.id}>
								<SessionItem session={root} />
								{(group.childrenByParent.get(root.id) ?? []).map((child) => (
									<SessionItem key={child.id} session={child} nested />
								))}
							</Fragment>
						))}
						{group.orphans.map((orphan) => (
							<SessionItem key={orphan.id} session={orphan} />
						))}
					</SessionGroup>
				))}
				{sessions.length === 0 && <div className={styles.empty}>No sessions yet</div>}
			</nav>
			<div className={styles.boardsHeader}>
				<span className={styles.title}>Boards</span>
				<button
					type="button"
					className="btn btn-ghost"
					title="New board"
					onClick={() => setCreatingBoard(true)}
					onKeyDown={(e) => e.stopPropagation()}
				>
					+ New
				</button>
			</div>
			<div className={styles.boardsList}>
				{boards.map((board) => (
					<BoardItem key={board.id} board={board} />
				))}
				{boards.length === 0 && <div className={styles.empty}>No boards yet</div>}
			</div>
			<div className={styles.footer}>
				<div className={styles.footerRow}>
					<button type="button" className={styles.footerBtn} onClick={onShowServer}>
						<span
							className={`status-dot ${connected ? "status-dot-on" : "status-dot-pending"}`}
							aria-hidden="true"
						/>
						Server
					</button>
					<button
						type="button"
						className={styles.themeBtn}
						onClick={toggleTheme}
						title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
						aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
						data-theme-toggle
					>
						{theme === "dark" ? "☀" : "☾"}
					</button>
				</div>
				<div className={styles.footerRow}>
					<button
						type="button"
						className={styles.footerBtn}
						onClick={() => navigate("/settings")}
						title="Settings"
					>
						Settings
					</button>
					<button
						type="button"
						className={styles.footerBtn}
						onClick={onSignOut}
						title="Sign out of backdash"
					>
						Sign out
					</button>
				</div>
			</div>
			<PromptDialog
				open={creatingBoard}
				title="New board"
				message="Give the new board a name."
				placeholder="Board name"
				submitLabel="Create"
				onSubmit={createBoardFromPrompt}
				onClose={() => setCreatingBoard(false)}
			/>
		</aside>
	);
}
