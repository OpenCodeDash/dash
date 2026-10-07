import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import styles from "../../tool-card.module.scss";

export const kanbanUpdateTag: ToolView = {
	summary: (state) => str(inputOf(state).tag),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const input = inputOf(part.state);
		const fields: [string, string][] = [];
		const name = str(input.name);
		const color = str(input.color);
		const description = str(input.description);
		const prompt = str(input.prompt);
		if (name) fields.push(["name", name]);
		if (color) fields.push(["color", color]);
		if (description) fields.push(["description", description]);
		if (prompt) fields.push(["prompt", prompt]);
		if (fields.length === 0) return <Output state={part.state} />;
		return (
			<div className={styles.fields}>
				{fields.map(([label, value]) => (
					<div key={label} className={styles.field}>
						<span className={styles.fieldLabel}>{label}</span>
						<span className={styles.fieldValue}>{value}</span>
					</div>
				))}
			</div>
		);
	},
};
