import { useState } from 'react'
import { useClientActions, useQuestions } from 'react-opencode'

type SelectedMap = Record<string, string[][]>
type CustomMap = Record<string, string[]>

export function QuestionPrompts({ sessionId }: { sessionId: string }) {
	const questions = useQuestions().filter((q) => q.sessionID === sessionId)
	const { replyQuestion, rejectQuestion } = useClientActions()
	const [selected, setSelected] = useState<SelectedMap>({})
	const [custom, setCustom] = useState<CustomMap>({})

	if (questions.length === 0) return null

	function toggleOption(requestId: string, qi: number, option: string, multiple?: boolean) {
		setSelected((cur) => {
			const req = cur[requestId] ?? []
			const current = req[qi] ?? []
			const next = multiple
				? current.includes(option)
					? current.filter((o) => o !== option)
					: [...current, option]
				: [option]
			const nextReq = [...req]
			nextReq[qi] = next
			return { ...cur, [requestId]: nextReq }
		})
	}

	function setCustomAnswer(requestId: string, qi: number, value: string) {
		setCustom((cur) => {
			const next = { ...cur }
			const req = next[requestId] ? [...next[requestId]] : []
			req[qi] = value
			next[requestId] = req
			return next
		})
	}

	function submit(requestId: string, questionCount: number) {
		const answers: string[][] = []
		for (let qi = 0; qi < questionCount; qi++) {
			const customValue = custom[requestId]?.[qi]?.trim()
			answers.push(customValue ? [customValue] : (selected[requestId]?.[qi] ?? []))
		}
		void replyQuestion(requestId, answers)
			.then(() => {
				setSelected((cur) => {
					const next = { ...cur }
					delete next[requestId]
					return next
				})
				setCustom((cur) => {
					const next = { ...cur }
					delete next[requestId]
					return next
				})
			})
			.catch(() => undefined)
	}

	function canSubmit(qId: string, count: number) {
		return Array.from({ length: count }).every((_, qi) => {
			const customValue = custom[qId]?.[qi]?.trim()
			return customValue ? customValue.length > 0 : (selected[qId]?.[qi] ?? []).length > 0
		})
	}

	return (
		<div className="prompt-cards">
			{questions.map((q) => (
				<div key={q.id} className="prompt-card">
					{q.questions.map((qq, qi) => {
						const options = selected[q.id]?.[qi] ?? []
						const customValue = custom[q.id]?.[qi] ?? ''
						return (
							<div key={qi} className="question">
								<div className="prompt-card-title">{qq.question}</div>
								<div className="question-options">
									{qq.options.map((opt) => (
										<button
											key={opt.label}
											type="button"
											className={`option ${options.includes(opt.label) ? 'option-selected' : ''}`}
											title={opt.description}
											onClick={() => toggleOption(q.id, qi, opt.label, qq.multiple)}
										>
											{opt.label}
										</button>
									))}
									{qq.custom !== false && (
										<input
											className="question-custom"
											placeholder="Type your own answer…"
											value={customValue}
											onChange={(e) => setCustomAnswer(q.id, qi, e.target.value)}
										/>
									)}
								</div>
							</div>
						)
					})}
					<div className="prompt-card-actions">
						<button
							type="button"
							className="btn btn-primary"
							disabled={!canSubmit(q.id, q.questions.length)}
							onClick={() => submit(q.id, q.questions.length)}
						>
							Submit
						</button>
						<button
							type="button"
							className="btn btn-danger"
							onClick={() => void rejectQuestion(q.id).catch(() => undefined)}
						>
							Reject
						</button>
					</div>
				</div>
			))}
		</div>
	)
}
