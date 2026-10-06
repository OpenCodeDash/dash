import { diffOf, inputOf, metadataOf, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import { DiffText } from "../../file-diff-panel/file-diff-panel.component.tsx";
import styles from "../tool-card.module.scss";

export const writeTool: ToolView = {
	summary: (state) => str(inputOf(state).filePath),
	body: (part) => {
		const { state } = part;
		const metadata = metadataOf(state);
		const diff = diffOf(metadata);
		const content = str(inputOf(state).content);
		return (
			<>
				{metadata.exists === false && (
					<div className="chip-row">
						<span className="chip chip-add">new file</span>
					</div>
				)}
				{diff ? (
					<DiffText text={diff} />
				) : content != null ? (
					<pre className={styles.pre}>{content}</pre>
				) : (
					<Output state={state} />
				)}
			</>
		);
	},
};
