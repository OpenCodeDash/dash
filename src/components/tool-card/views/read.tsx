import { inputOf, metadataOf, str, type ToolView } from "./types.ts";
import { CodeLines, Output } from "./shared.tsx";

function readFileContent(output: string): string | undefined {
	return output.match(/<content>\n?([\s\S]*?)\n?<\/content>/)?.[1];
}

export const readTool: ToolView = {
	summary: (state) => str(inputOf(state).filePath),
	body: (part) => {
		const { state } = part;
		const content = state.status === "completed" ? readFileContent(state.output) : undefined;
		const truncated = metadataOf(state).truncated === true;
		return (
			<>
				{content != null ? <CodeLines text={content} /> : <Output state={state} />}
				{truncated && (
					<div className="chip-row">
						<span className="chip">truncated</span>
					</div>
				)}
			</>
		);
	},
};
