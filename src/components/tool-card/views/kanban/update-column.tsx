import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import styles from "../../tool-card.module.scss";

export const kanbanUpdateColumn: ToolView = {
	summary: (state) => str(inputOf(state).column),
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const input = inputOf(part.state);
		const fields: [string, string][] = [];
		const name = str(input.name);
		const push = str(input.push_description);
		const pull = str(input.pull_description);
		if (name) fields.push(["name", name]);
		if (input.is_queue != null) fields.push(["queue", input.is_queue === true ? "yes" : "no"]);
		if (push) fields.push(["push", push]);
		if (pull) fields.push(["pull", pull]);
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
