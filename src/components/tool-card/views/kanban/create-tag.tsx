import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import styles from "../../tool-card.module.scss";

export const kanbanCreateTag: ToolView = {
	summary: (state) => str(inputOf(state).name),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const input = inputOf(part.state);
		const color = str(input.color);
		const description = str(input.description);
		const prompt = str(input.prompt);
		return (
			<>
				{color && (
					<div className="chip-row">
						<span className={styles.swatch} style={{ background: color }} />
						<span className="chip">{color}</span>
					</div>
				)}
				{description && <div className={styles.tagDesc}>{description}</div>}
				{prompt && <div className={styles.tagPrompt}>{prompt}</div>}
			</>
		);
	},
};
