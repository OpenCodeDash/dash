import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useClientActions, useSessions } from 'react-opencode'

export function Home() {
	const sessions = useSessions()
	const { createSession } = useClientActions()
	const navigate = useNavigate()
	const [error, setError] = useState<string | null>(null)

	if (sessions.length > 0) {
		return <Navigate to={`/session/${sessions[0].id}`} replace />
	}

	return (
		<div className="home">
			<div className="home-inner">
				<h1>OpenCode Dashboard</h1>
				<p>No sessions yet. Create one to get started.</p>
				{error && <div className="home-error">{error}</div>}
				<button
					type="button"
					className="btn btn-primary"
					onClick={() =>
						void createSession()
							.then((session) => navigate(`/session/${session.id}`))
							.catch((e) => setError(e instanceof Error ? e.message : String(e)))
					}
				>
					New session
				</button>
			</div>
		</div>
	)
}
