import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientActions, useConnected, useSessions } from "react-opencode";
import { SessionItem } from "./SessionItem.tsx";

export function Sidebar() {
	const sessions = useSessions();
	const connected = useConnected();
	const { createSession } = useClientActions();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	return (
		<aside className="sidebar">
			<div className="sidebar-header">
				<span
					className={`conn-dot ${connected ? "conn-dot-on" : "conn-dot-off"}`}
					title={connected ? "Connected" : "Connecting…"}
				/>
				<span className="sidebar-title">Sessions</span>
				<button
					type="button"
					className="btn btn-ghost"
					title="New session"
					onClick={() =>
						void createSession()
							.then((session) => navigate(`/session/${session.id}`))
							.catch((e) => setError(e instanceof Error ? e.message : String(e)))
					}
				>
					+
				</button>
			</div>
			{error && <div className="sidebar-error">{error}</div>}
			<nav className="session-list">
				{sessions.map((session) => (
					<SessionItem key={session.id} session={session} />
				))}
				{sessions.length === 0 && <div className="session-list-empty">No sessions</div>}
			</nav>
		</aside>
	);
}
