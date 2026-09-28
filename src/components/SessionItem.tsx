import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useClientActions, useSessionBusy, type Session } from 'react-opencode'

export function SessionItem({ session }: { session: Session }) {
	const busy = useSessionBusy(session.id)
	const { renameSession, deleteSession } = useClientActions()
	const navigate = useNavigate()
	const location = useLocation()
	const [renaming, setRenaming] = useState(false)
	const [title, setTitle] = useState('')
	const active = location.pathname === `/session/${session.id}`

	function startRename() {
		setTitle(session.title ?? '')
		setRenaming(true)
	}

	function commitRename() {
		setRenaming(false)
		const trimmed = title.trim()
		if (trimmed && trimmed !== session.title) {
			void renameSession(session.id, trimmed).catch(() => undefined)
		}
	}

	function remove() {
		if (window.confirm(`Delete session "${session.title ?? 'New session'}"?`)) {
			void deleteSession(session.id)
				.then(() => {
					if (active) navigate('/')
				})
				.catch(() => undefined)
		}
	}

	return (
		<div
			className={`session-item ${active ? 'session-item-active' : ''}`}
			onClick={() => navigate(`/session/${session.id}`)}
		>
			{busy && <span className="busy-dot" title="Busy" />}
			{renaming ? (
				<input
					className="rename-input"
					value={title}
					autoFocus
					onClick={(e) => e.stopPropagation()}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={commitRename}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commitRename()
						if (e.key === 'Escape') setRenaming(false)
					}}
				/>
			) : (
				<span
					className="session-item-title"
					onDoubleClick={startRename}
					title="Double-click to rename"
				>
					{session.title ?? 'New session'}
				</span>
			)}
			<button
				type="button"
				className="icon-btn"
				title="Delete session"
				onClick={(e) => {
					e.stopPropagation()
					remove()
				}}
			>
				✕
			</button>
		</div>
	)
}
