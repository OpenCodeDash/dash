import { inputOf, str, type ToolView } from "../types.ts";
import { Output } from "../shared.tsx";

export const kanbanReorderColumns: ToolView = {
	summary: (state) => str(inputOf(state).board),
	body: (part) => {
		const columns = inputOf(part.state).columns;
		if (!Array.isArray(columns)) return <Output state={part.state} />;
		return (
			<div className="chip-row">
				{columns.map((column, i) => {
					const name = str(column);
					return name ? (
						<span key={i} className="chip">
							{i + 1}. {name}
						</span>
					) : null;
				})}
			</div>
		);
	},
};
