import type { KanbanBoard, KanbanBoardRef, KanbanTag } from "./parse.ts";
import styles from "../../tool-card.module.scss";

export function BoardList({ boards }: { boards: KanbanBoardRef[] }) {
	return (
		<div className={styles.boardList}>
			{boards.map((board) => (
				<div key={board.id} className={styles.boardRow}>
					<span className={styles.boardName}>{board.name}</span>
					<span className="chip">{board.id}</span>
				</div>
			))}
		</div>
	);
}

export function BoardView({ board }: { board: KanbanBoard }) {
	return (
		<div className={styles.board}>
			<div className={styles.boardHead}>
				<span className={styles.boardName}>{board.title}</span>
				<span className="chip">{board.id}</span>
				{board.tags.map((tag) => (
					<span key={tag} className="chip">
						{tag}
					</span>
				))}
			</div>
			<div className={styles.columns}>
				{board.columns.map((column) => (
					<div key={column.name} className={styles.column}>
						<div className={styles.columnHead}>
							<span className={styles.columnName}>{column.name}</span>
							{column.queue && <span className="chip">queue</span>}
							<span className={styles.columnCount}>{column.tasks.length}</span>
						</div>
						{column.tasks.map((task) => (
							<div key={task.id} className={styles.task}>
								<span className={styles.taskId}>#{task.id}</span>
								<span className={styles.taskName}>{task.name}</span>
								{task.tags.map((tag) => (
									<span key={tag} className="chip">
										{tag}
									</span>
								))}
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export function TagList({ tags }: { tags: KanbanTag[] }) {
	return (
		<div className={styles.tagList}>
			{tags.map((tag) => (
				<div key={tag.id} className={styles.tagRow}>
					<div className={styles.tagHead}>
						<span className={styles.swatch} style={{ background: tag.color }} />
						<span className={styles.tagName}>{tag.name}</span>
						<span className="chip">#{tag.id}</span>
						<span className={styles.tagColor}>{tag.color}</span>
					</div>
					{tag.description && <div className={styles.tagDesc}>{tag.description}</div>}
					{tag.prompt && <div className={styles.tagPrompt}>{tag.prompt}</div>}
				</div>
			))}
		</div>
	);
}
