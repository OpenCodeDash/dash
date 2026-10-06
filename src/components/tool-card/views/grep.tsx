import { inputOf, metadataOf, num, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";

export const grepTool: ToolView = {
	summary: (state) => {
		const input = inputOf(state);
		const pattern = str(input.pattern);
		const include = str(input.include);
		return include ? `${pattern} · ${include}` : pattern;
	},
	body: (part) => {
		const matches = num(metadataOf(part.state).matches);
		return (
			<>
				<Output state={part.state} />
				{matches != null && (
					<div className="chip-row">
						<span className="chip">{matches} matches</span>
					</div>
				)}
			</>
		);
	},
};
