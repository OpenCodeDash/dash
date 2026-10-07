import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import styles from "../../tool-card.module.scss";

export const kanbanCreateTask: ToolView = {
	summary: (state) => str(inputOf(state).name),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const input = inputOf(part.state);
		const board = str(input.board);
		const column = str(input.column);
		const priority = str(input.priority);
		const assignee = str(input.assignee);
		const description = str(input.description);
		const tags = Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === "string") : [];
		return (
			<>
				<div className="chip-row">
					{board && <span className="chip">board {board}</span>}
					{column && <span className="chip">→ {column}</span>}
					{priority && <span className="chip">{priority} priority</span>}
					{assignee && <span className="chip">@{assignee}</span>}
					{tags.map((tag) => (
						<span key={tag} className="chip">
							{tag}
						</span>
					))}
				</div>
				{description && <pre className={styles.pre}>{description}</pre>}
			</>
		);
	},
};
