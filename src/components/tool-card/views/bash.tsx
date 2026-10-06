import { inputOf, metadataOf, num, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import styles from "../tool-card.module.scss";

export const bashTool: ToolView = {
	summary: (state) => str(inputOf(state).command),
	body: (part) => {
		const { state } = part;
		const command = str(inputOf(state).command);
		const exit = num(metadataOf(state).exit);
		return (
			<>
				{command && (
					<pre className={styles.pre}>
						<span className={styles.prompt}>$ </span>
						{command}
					</pre>
				)}
				<Output state={state} />
				{exit != null && exit !== 0 && (
					<div className="chip-row">
						<span className="chip chip-del">exit {exit}</span>
					</div>
				)}
			</>
		);
	},
};
