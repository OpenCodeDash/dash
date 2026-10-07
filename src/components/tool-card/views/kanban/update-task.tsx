import { idStr, inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";
import styles from "../../tool-card.module.scss";

export const kanbanUpdateTask: ToolView = {
	summary: (state) => {
		const id = idStr(inputOf(state).task_id);
		return id ? `Update #${id}` : "Update task";
	},
	body: (part) => {
		if (part.state.status !== "completed") return <Output state={part.state} />;
		const input = inputOf(part.state);
		const fields: [string, string][] = [];
		const name = str(input.name);
		const priority = str(input.priority);
		const assignee = str(input.assignee);
		const due = str(input.due_at);
		const column = str(input.column);
		const description = str(input.description);
		if (name) fields.push(["name", name]);
		if (priority) fields.push(["priority", priority]);
		if (input.estimate != null) fields.push(["estimate", String(input.estimate)]);
		if (assignee) fields.push(["assignee", assignee]);
		if (due) fields.push(["due", due]);
		if (column) fields.push(["column", column]);
		if (Array.isArray(input.tags)) {
			const tags = input.tags.filter((t): t is string => typeof t === "string");
			if (tags.length) fields.push(["tags", tags.join(", ")]);
		}
		if (description) fields.push(["description", description]);
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
