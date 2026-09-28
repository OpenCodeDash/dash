import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useFileStatus, useSession, useSessionBusy, useTodos } from 'react-opencode'
import { MessageList } from './MessageList.tsx'
import { PromptComposer } from './PromptComposer.tsx'
import { PermissionPrompts } from './PermissionPrompts.tsx'
import { QuestionPrompts } from './QuestionPrompts.tsx'
import { TodosPanel } from './TodosPanel.tsx'
import { FileDiffPanel } from './FileDiffPanel.tsx'

type Panel = 'todos' | 'files' | null

export function SessionView() {
	const { sessionId } = useParams<{ sessionId: string }>()
	const session = useSession(sessionId)
	const busy = useSessionBusy(sessionId)
	const todos = useTodos(sessionId)
	const fileStatus = useFileStatus()
	const [panel, setPanel] = useState<Panel>(null)

	if (!sessionId) return null

	const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p))

	return (
		<div className="session">
			<header className="session-header">
				<h1 className="session-title">{session?.title ?? 'Session'}</h1>
				<div className="session-meta">
					{session?.model && (
						<span className="chip">
							{session.model.providerID}/{session.model.id}
						</span>
					)}
					{session?.cost != null && <span className="chip">${session.cost.toFixed(4)}</span>}
				</div>
				<div className="session-actions">
					<button
						type="button"
						className={`btn ${panel === 'todos' ? 'btn-active' : ''}`}
						onClick={() => toggle('todos')}
					>
						Todos{todos.length > 0 ? ` (${todos.length})` : ''}
					</button>
					<button
						type="button"
						className={`btn ${panel === 'files' ? 'btn-active' : ''}`}
						onClick={() => toggle('files')}
					>
						Files{fileStatus.length > 0 ? ` (${fileStatus.length})` : ''}
					</button>
				</div>
			</header>
			<div className="session-body">
				<div className="session-main">
					<MessageList sessionId={sessionId} />
					<PermissionPrompts sessionId={sessionId} />
					<QuestionPrompts sessionId={sessionId} />
					<PromptComposer sessionId={sessionId} busy={busy} />
				</div>
				{panel === 'todos' && <TodosPanel sessionId={sessionId} />}
				{panel === 'files' && <FileDiffPanel sessionId={sessionId} />}
			</div>
		</div>
	)
}
