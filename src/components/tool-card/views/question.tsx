import { inputOf, metadataOf, type QuestionInput, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import styles from "../tool-card.module.scss";

export const questionTool: ToolView = {
	summary: (state) => {
		const questions = inputOf(state).questions;
		const count = Array.isArray(questions) ? questions.length : 0;
		return count > 0 ? `Asked ${count} question${count === 1 ? "" : "s"}` : undefined;
	},
	body: (part) => {
		const { state } = part;
		const questions = inputOf(state).questions;
		const answersRaw = metadataOf(state).answers;
		const answers = Array.isArray(answersRaw) ? (answersRaw as string[][]) : [];
		if (!Array.isArray(questions) || questions.length === 0) return <Output state={state} />;
		return (
			<div className={styles.questions}>
				{questions.map((raw, qi) => {
					const question = raw as QuestionInput;
					const options = question.options ?? [];
					const chosen = answers[qi] ?? [];
					const custom = chosen.filter((c) => !options.some((o) => o.label === c));
					return (
						<div key={qi} className={styles.question}>
							{question.header && <span className="chip">{question.header}</span>}
							{question.question && <div className={styles.qText}>{question.question}</div>}
							<div className={styles.options}>
								{options.map((opt) => {
									const picked = chosen.includes(opt.label);
									return (
										<div
											key={opt.label}
											className={`${styles.option} ${picked ? styles.optionPicked : ""}`}
										>
											<span className={styles.optionLabel}>
												{picked ? "✓ " : ""}
												{opt.label}
											</span>
											{opt.description && (
												<span className={styles.optionDesc}>{opt.description}</span>
											)}
										</div>
									);
								})}
								{custom.map((answer) => (
									<div key={answer} className={`${styles.option} ${styles.optionPicked}`}>
										<span className={styles.optionLabel}>✓ {answer}</span>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		);
	},
};
