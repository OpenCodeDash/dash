import { Navigate } from "react-router-dom";
import { useSessions } from "react-opencode";
import styles from "./home-page.module.scss";

export function HomePage({ onNewSession }: { onNewSession: () => void }) {
	const sessions = useSessions();

	if (sessions.length > 0) {
		return <Navigate to={`/session/${sessions[0].id}`} replace />;
	}

	return (
		<div className={styles.home}>
			<div className={styles.inner}>
				<h1>OpenCode Dashboard</h1>
				<p>No sessions yet. Create one to get started.</p>
				<button type="button" className="btn btn-primary" onClick={onNewSession}>
					New session
				</button>
			</div>
		</div>
	);
}
