import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Modal } from "../../components/modal/modal.component.tsx";
import {
	downloadCsv,
	getCampaign,
	getResults,
	pauseCampaign,
	resumeCampaign,
	sendFeedback,
	stopCampaign,
	subscribeEvents,
	type ResearchCampaignDetail,
	type ResearchCriterion,
	type ResearchResults,
	type ResearchRow,
} from "../../research/client.ts";
import styles from "./research-detail-page.module.scss";

const STAGES = [
	"discover",
	"collect",
	"text",
	"vision",
	"score",
	"export",
] as const;

interface ActivityItem {
	at: string;
	type: string;
	level: "info" | "error";
	message: string;
}

function errText(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}

function statusClass(status: string): string {
	if (status === "running") return styles.running;
	if (status === "paused") return styles.paused;
	if (status === "complete") return styles.done;
	if (status === "stopped" || status === "budget") return styles.warn;
	return styles.idle;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "—";
	if (typeof value === "boolean") return value ? "yes" : "no";
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

function criterionFactKey(criterion: ResearchCriterion): string {
	return criterion.source.type === "field"
		? criterion.source.field
		: criterion.key;
}

function criterionSourceLabel(criterion: ResearchCriterion): string {
	const source = criterion.source;
	if (source.type === "field") return `field:${source.field}`;
	if (source.type === "derived") return `derived:${source.evaluator}`;
	return source.type;
}

function RowDetail({ row }: { row: ResearchRow }) {
	const fields = Object.entries(row.fields).filter(
		([key]) => key !== "description" && key !== "media_urls",
	);
	const description =
		typeof row.fields.description === "string" ? row.fields.description : null;

	return (
		<div className={styles.detail}>
			<div className={styles.detailMeta}>
				<span>Rank {row.rank ?? "—"}</span>
				<span>Score {row.score.toFixed(2)}</span>
				<span>Coverage {row.coverage.toFixed(2)}</span>
				<span>{row.source}</span>
				<span>{row.status}</span>
			</div>

			<a href={row.url} target="_blank" rel="noreferrer" className={styles.link}>
				{row.url}
			</a>

			{row.hardFailures.length > 0 && (
				<div className={styles.failures}>
					<strong>Hard failures:</strong> {row.hardFailures.join("; ")}
				</div>
			)}

			<section>
				<h3>Criteria</h3>
				<table className={styles.miniTable}>
					<thead>
						<tr>
							<th>Criterion</th>
							<th>Value</th>
							<th>Weight</th>
							<th>Contribution</th>
							<th>State</th>
							<th>Origin</th>
							<th>Source</th>
						</tr>
					</thead>
					<tbody>
						{(row.breakdown ?? []).map((criterion) => (
							<tr key={criterion.key}>
								<td>{criterion.label}</td>
								<td>
									{criterion.normalized === null
										? "—"
										: criterion.normalized.toFixed(2)}
								</td>
								<td>{criterion.weight.toFixed(2)}</td>
								<td>{criterion.contribution.toFixed(2)}</td>
								<td>
									{criterion.known
										? "known"
										: criterion.penalized
											? "penalised"
											: criterion.policy === "ignored"
												? "ignored"
												: "unknown"}
								</td>
								<td>{criterion.origin ?? "—"}</td>
								<td>{criterion.sourceType ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<section>
				<h3>Evidence</h3>
				<div className={styles.fields}>
					{fields.map(([key, value]) => (
						<div key={key} className={styles.field}>
							<span className={styles.fieldKey}>{key}</span>
							<span>{formatValue(value)}</span>
						</div>
					))}
				</div>
			</section>

			{description && (
				<section>
					<h3>Description</h3>
					<p className={styles.description}>{description}</p>
				</section>
			)}

			{row.gaps.length > 0 && (
				<section>
					<h3>Unknowns</h3>
					<ul className={styles.gaps}>
						{row.gaps.map((gap) => (
							<li key={gap.key}>
								{gap.label}: {gap.reason}
								{gap.investigate ? " (investigate)" : ""}
							</li>
						))}
					</ul>
				</section>
			)}

			{row.questions.length > 0 && (
				<section>
					<h3>Questions to ask</h3>
					<ul className={styles.gaps}>
						{row.questions.map((question) => (
							<li key={question}>{question}</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

export function ResearchDetailPage() {
	const { id } = useParams<{ id: string }>();
	const [detail, setDetail] = useState<ResearchCampaignDetail | null>(null);
	const [results, setResults] = useState<ResearchResults | null>(null);
	const [stage, setStage] = useState<string>("discover");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [feedbackResult, setFeedbackResult] = useState<string | null>(null);
	const [selected, setSelected] = useState<ResearchRow | null>(null);
	const [activity, setActivity] = useState<ActivityItem[]>([]);
	const refreshTimer = useRef<number | null>(null);

	const refresh = useCallback(async () => {
		if (!id) return;
		try {
			const [campaign, rows] = await Promise.all([getCampaign(id), getResults(id)]);
			setDetail(campaign);
			setResults(rows);
			setError(null);
			if (!campaign.campaign.running && campaign.campaign.status === "complete") {
				setStage("export");
			}
		} catch (err) {
			setError(errText(err));
		}
	}, [id]);

	const scheduleRefresh = useCallback(() => {
		if (refreshTimer.current !== null) return;
		refreshTimer.current = window.setTimeout(() => {
			refreshTimer.current = null;
			void refresh();
		}, 500);
	}, [refresh]);

	useEffect(
		() => () => {
			if (refreshTimer.current !== null) {
				window.clearTimeout(refreshTimer.current);
			}
		},
		[],
	);

	useEffect(() => {
		if (!id) return;
		let active = true;
		Promise.all([getCampaign(id), getResults(id)])
			.then(([campaign, rows]) => {
				if (!active) return;
				setDetail(campaign);
				setResults(rows);
				setError(null);
				if (!campaign.campaign.running && campaign.campaign.status === "complete") {
					setStage("export");
				}
			})
			.catch((err) => {
				if (active) setError(errText(err));
			});
		return () => {
			active = false;
		};
	}, [id]);

	useEffect(() => {
		if (!id) return;
		return subscribeEvents(
			id,
			(event) => {
				const at =
					typeof event.at === "string" ? event.at : new Date().toISOString();
				const append = (item: Omit<ActivityItem, "at">) =>
					setActivity((previous) =>
						[...previous, { at, ...item }].slice(-200),
					);

				if (event.type === "progress") {
					const name = typeof event.stage === "string" ? event.stage : "run";
					if (
						name === "discover" ||
						name === "collect" ||
						name === "text" ||
						name === "vision"
					) {
						setStage(name);
					}
					append({
						type: name,
						level: "info",
						message:
							typeof event.message === "string"
								? event.message
								: `${String(event.current ?? "?")}/${String(event.total ?? "?")}`,
					});
				} else if (event.type === "log") {
					append({
						type: "log",
						level: event.level === "error" ? "error" : "info",
						message: String(event.message ?? ""),
					});
				} else if (event.type === "stage") {
					if (typeof event.stage === "string") setStage(event.stage);
					append({
						type: "stage",
						level: "info",
						message: `→ ${String(event.stage)}`,
					});
				} else if (event.type === "run.started") {
					setStage("discover");
					append({ type: "run", level: "info", message: "started" });
				} else if (event.type === "run.finished") {
					setStage("export");
					append({
						type: "run",
						level: "info",
						message: `finished: ${String(event.stopReason ?? "done")}`,
					});
					void refresh();
				} else if (event.type === "error") {
					append({
						type: "error",
						level: "error",
						message: String(event.message ?? "error"),
					});
				} else if (event.type === "status") {
					const campaign = event.campaign as
						| { status?: string }
						| undefined;
					append({
						type: "status",
						level: "info",
						message: `connected · ${campaign?.status ?? "unknown"}`,
					});
				}

				scheduleRefresh();
			},
			(err) => setError(err.message),
		);
	}, [id, refresh, scheduleRefresh]);

	const running = detail?.campaign.running ?? false;
	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => void refresh(), 3000);
		return () => clearInterval(timer);
	}, [running, refresh]);

	async function act(action: "pause" | "resume" | "stop") {
		if (!id) return;
		setBusy(true);
		setError(null);
		try {
			if (action === "pause") await pauseCampaign(id);
			if (action === "resume") await resumeCampaign(id);
			if (action === "stop") await stopCampaign(id);
			await refresh();
		} catch (err) {
			setError(errText(err));
		} finally {
			setBusy(false);
		}
	}

	async function submitFeedback(event: React.FormEvent) {
		event.preventDefault();
		if (!id || !feedback.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			const result = await sendFeedback(id, feedback.trim());
			setFeedback("");
			setFeedbackResult(result.summary);
			await refresh();
		} catch (err) {
			setError(errText(err));
		} finally {
			setBusy(false);
		}
	}

	async function exportCsv() {
		if (!id) return;
		try {
			await downloadCsv(id);
		} catch (err) {
			setError(errText(err));
		}
	}

	if (!id) return null;
	if (!detail) {
		return (
			<div className={styles.page}>
				<div className={styles.inner}>
					{error ? <div className={styles.error}>{error}</div> : "Loading…"}
				</div>
			</div>
		);
	}

	const campaign = detail.campaign;
	const summary = campaign.lastSummary;
	const criteria = detail.criteria ?? [];
	const columns = [...criteria]
		.filter((criterion) => criterion.weight > 0)
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 6);
	const currentStage = STAGES.indexOf(stage as (typeof STAGES)[number]);
	const canResume =
		!campaign.running &&
		(campaign.paused ||
			summary?.stopReason === "paused" ||
			summary?.stopReason === "stopped");

	return (
		<div className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.breadcrumb}>
					<Link to="/research" className={styles.back}>
						← Research
					</Link>
				</div>

				<header className={styles.top}>
					<div className={styles.heading}>
						<div className={styles.titleRow}>
							<h1>{campaign.name}</h1>
							<span className={`${styles.chip} ${statusClass(campaign.status)}`}>
								{campaign.status}
							</span>
						</div>
						<p className={styles.prompt}>{campaign.prompt}</p>
					</div>
					<div className={styles.actions}>
						{campaign.running && (
							<button
								type="button"
								className="btn"
								disabled={busy}
								onClick={() => void act("pause")}
							>
								Pause
							</button>
						)}
						{canResume && (
							<button
								type="button"
								className="btn btn-primary"
								disabled={busy}
								onClick={() => void act("resume")}
							>
								Resume
							</button>
						)}
						{campaign.running && (
							<button
								type="button"
								className="btn btn-danger"
								disabled={busy}
								onClick={() => void act("stop")}
							>
								Stop
							</button>
						)}
						<button type="button" className="btn" onClick={() => void exportCsv()}>
							Export CSV
						</button>
					</div>
				</header>

				<div className={styles.stages}>
					{STAGES.map((name, index) => (
						<span
							key={name}
							className={`${styles.stage} ${
								index < currentStage
									? styles.stageDone
									: index === currentStage
										? styles.stageActive
										: ""
							}`}
						>
							{name}
						</span>
					))}
				</div>

				<div className={styles.counters}>
					<div className={styles.counter}>
						<span className={styles.counterValue}>
							{summary?.discovered ?? "—"}
						</span>
						<span className={styles.counterLabel}>Discovered</span>
					</div>
					<div className={styles.counter}>
						<span className={styles.counterValue}>
							{results?.counts.listings ?? summary?.collected ?? 0}
						</span>
						<span className={styles.counterLabel}>Collected</span>
					</div>
					<div className={styles.counter}>
						<span className={styles.counterValue}>
							{results?.counts.hardPass ?? 0}
						</span>
						<span className={styles.counterLabel}>Passed</span>
					</div>
					<div className={styles.counter}>
						<span className={styles.counterValue}>
							{results?.counts.withGaps ?? 0}
						</span>
						<span className={styles.counterLabel}>With gaps</span>
					</div>
					<div className={styles.counter}>
						<span className={styles.counterValue}>
							${(summary?.spendUsd ?? 0).toFixed(2)}
						</span>
						<span className={styles.counterLabel}>Spend</span>
					</div>
				</div>

				{error && <div className={styles.error}>{error}</div>}

				<section className={styles.activity}>
					<div className={styles.activityHead}>
						<h2>Activity</h2>
						<div className={styles.activityActions}>
							<span className={styles.hint}>{activity.length} events</span>
							<button
								type="button"
								className="btn btn-ghost"
								onClick={() => setActivity([])}
							>
								Clear
							</button>
						</div>
					</div>
					{activity.length === 0 ? (
						<div className={styles.empty}>Waiting for events…</div>
					) : (
						<ol className={styles.log}>
							{activity
								.slice()
								.reverse()
								.map((item, index) => (
									<li
										key={`${item.at}-${index}`}
										className={
											item.level === "error" ? styles.logError : styles.logLine
										}
									>
										<span className={styles.logTime}>
											{new Date(item.at).toLocaleTimeString()}
										</span>
										<span className={styles.logType}>{item.type}</span>
										<span className={styles.logMessage}>{item.message}</span>
									</li>
								))}
						</ol>
					)}
				</section>

				{summary && summary.errors.length > 0 && (
					<details className={styles.runErrors}>
						<summary>{summary.errors.length} run error(s)</summary>
						<ul>
							{summary.errors.slice(0, 30).map((message, index) => (
								<li key={index}>{message}</li>
							))}
						</ul>
					</details>
				)}

				<section className={styles.feedback}>
					<h2>Steer it</h2>
					<p className={styles.hint}>
						Weights and limits re-score instantly. A coverage complaint or new
						area starts another search.
					</p>
					<form onSubmit={submitFeedback} className={styles.feedbackRow}>
						<textarea
							value={feedback}
							onChange={(e) => setFeedback(e.target.value)}
							placeholder="Drop anything without a carpark, and 25 min is too far — make it 15"
							rows={2}
							className={styles.textarea}
						/>
						<button
							type="submit"
							className="btn btn-primary"
							disabled={!feedback.trim() || busy}
						>
							Apply
						</button>
					</form>
					{feedbackResult && (
						<div className={styles.feedbackResult}>{feedbackResult}</div>
					)}
				</section>

				<section className={styles.results}>
					<div className={styles.resultsHead}>
						<h2>Shortlist</h2>
						{results && (
							<span className={styles.hint}>
								brief v{results.briefVersion ?? "?"} ·{" "}
								{results.rows.length} rows
							</span>
						)}
					</div>

					{!results || results.rows.length === 0 ? (
						<div className={styles.empty}>No listings collected yet.</div>
					) : (
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th>Rank</th>
										<th>Score</th>
										<th>Coverage</th>
										<th>Listing</th>
										{columns.map((criterion) => (
											<th key={criterion.key}>{criterion.label}</th>
										))}
										<th>Gaps</th>
									</tr>
								</thead>
								<tbody>
									{results.rows.map((row) => (
										<tr
											key={row.listingId}
											className={row.hardPass ? "" : styles.failed}
											onClick={() => setSelected(row)}
										>
											<td>{row.rank ?? "—"}</td>
											<td>{row.score.toFixed(2)}</td>
											<td>{row.coverage.toFixed(2)}</td>
											<td className={styles.listingCell}>
												<a
													href={row.url}
													target="_blank"
													rel="noreferrer"
													onClick={(event) => event.stopPropagation()}
												>
													{formatValue(
														row.fields.title ??
															row.fields.address ??
															row.url,
													)}
												</a>
											</td>
											{columns.map((criterion) => (
												<td key={criterion.key}>
													{formatValue(
														row.fields[criterionFactKey(criterion)],
													)}
												</td>
											))}
											<td>{row.gaps.length}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				{criteria.length > 0 && (
					<details className={styles.briefBox}>
						<summary>Criteria ({criteria.length})</summary>
						<ul className={styles.criteriaList}>
							{criteria.map((criterion) => (
								<li key={criterion.key}>
									<strong>{criterion.label}</strong>{" "}
									{criterion.weight.toFixed(2)} · {criterion.origin} ·{" "}
									{criterionSourceLabel(criterion)}
									{criterion.hard ? " · hard" : ""}
									{criterion.rationale ? ` — ${criterion.rationale}` : ""}
								</li>
							))}
						</ul>
						{detail.warnings && detail.warnings.length > 0 && (
							<ul className={styles.criteriaWarnings}>
								{detail.warnings.map((warning, index) => (
									<li key={index}>{warning}</li>
								))}
							</ul>
						)}
					</details>
				)}

				<details className={styles.briefBox}>
					<summary>Brief</summary>
					<pre>{detail.brief}</pre>
				</details>
			</div>

			<Modal
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? `Listing ${selected.listingId}` : ""}
				maxWidth={760}
			>
				{selected && <RowDetail row={selected} />}
			</Modal>
		</div>
	);
}
