import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { httpUrl, inputOf, str, type ToolView } from "./types.ts";
import { Output } from "./shared.tsx";
import styles from "../tool-card.module.scss";

export const webfetchTool: ToolView = {
	summary: (state) => str(inputOf(state).url),
	body: (part) => {
		const { state } = part;
		const url = str(inputOf(state).url);
		const href = httpUrl(url);
		const format = str(inputOf(state).format);
		return (
			<>
				{(url || format) && (
					<div className={styles.metaRow}>
						{url &&
							(href ? (
								<a className={styles.link} href={href} target="_blank" rel="noreferrer">
									{url}
								</a>
							) : (
								<span className={styles.link}>{url}</span>
							))}
						{format && <span className="chip">{format}</span>}
					</div>
				)}
				{state.status === "completed" ? (
					<div className={`md ${styles.fetch}`}>
						<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.output}</ReactMarkdown>
					</div>
				) : (
					<Output state={state} />
				)}
			</>
		);
	},
};
