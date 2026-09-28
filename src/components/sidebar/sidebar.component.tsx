import { useMemo } from "react";
import { useConnected, useSessions, type Session } from "react-opencode";
import { SessionGroup } from "../session-group/session-group.component.tsx";
import { SessionItem } from "../session-item/session-item.component.tsx";
import styles from "./sidebar.module.scss";

interface SidebarProps {
	open: boolean;
	onNewSession: () => void;
	onShowServer: () => void;
}

interface Group {
	directory: string;
	sessions: Session[];
}

export function Sidebar({ open, onNewSession, onShowServer }: SidebarProps) {
	const sessions = useSessions();
	const connected = useConnected();

	const groups = useMemo<Group[]>(() => {
		const map = new Map<string, Session[]>();
		for (const s of sessions) {
			const key = s.directory || "/";
			const arr = map.get(key) ?? [];
			arr.push(s);
			map.set(key, arr);
		}
		for (const arr of map.values()) arr.sort((a, b) => (b.time.updated ?? 0) - (a.time.updated ?? 0));
		return [...map.entries()]
			.map(([directory, list]) => ({ directory, sessions: list }))
			.sort((a, b) => (b.sessions[0]?.time.updated ?? 0) - (a.sessions[0]?.time.updated ?? 0));
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
						{group.sessions.map((session) => (
							<SessionItem key={session.id} session={session} />
						))}
					</SessionGroup>
				))}
				{sessions.length === 0 && <div className={styles.empty}>No sessions yet</div>}
			</nav>
			<div className={styles.footer}>
				<button type="button" className={styles.footerBtn} onClick={onShowServer}>
					<span className="status-dot status-dot-connected" />
					Server
				</button>
			</div>
		</aside>
	);
}
