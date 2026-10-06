import { inputOf, metadataOf, num, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";

export const globTool: ToolView = {
	summary: (state) => str(inputOf(state).pattern),
	body: (part) => {
		const count = num(metadataOf(part.state).count);
		return (
			<>
				<Output state={part.state} />
				{count != null && (
					<div className="chip-row">
						<span className="chip">{count} files</span>
					</div>
				)}
			</>
		);
	},
};
