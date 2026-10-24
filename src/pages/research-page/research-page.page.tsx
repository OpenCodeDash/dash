import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/modal/modal.component.tsx";
import {
	createCampaign,
	deleteCampaign,
	listCampaigns,
	previewCampaign,
	type ResearchCampaignStatus,
	type ResearchCriterion,
	type ResearchPreview,
} from "../../research/client.ts";
import styles from "./research-page.module.scss";

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

function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function sourceLabel(criterion: ResearchCriterion): string {
	const source = criterion.source;
	if (source.type === "field") return `field: ${source.field}`;
	if (source.type === "derived") return `derived: ${source.evaluator}`;
	return source.type;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function CampaignRow({
	campaign,
	onDelete,
}: {
	campaign: ResearchCampaignStatus;
	onDelete: (campaign: ResearchCampaignStatus) => void;
}) {
	const navigate = useNavigate();
	const summary = campaign.lastSummary;

	return (
		<div className={styles.rowWrap}>
		<button
			type="button"
			className={styles.row}
			onClick={() => navigate(`/research/${campaign.id}`)}
		>
			<div className={styles.rowMain}>
				<div className={styles.rowTop}>
					<span className={styles.name}>{campaign.name}</span>
					<span className={`${styles.chip} ${statusClass(campaign.status)}`}>
						{campaign.status}
					</span>
				</div>
				<div className={styles.prompt}>{campaign.prompt}</div>
				<div className={styles.meta}>
					<span>{campaign.pack}</span>
					<span>{formatDate(campaign.createdAt)}</span>
					{summary && (
						<>
							<span>{summary.collected} collected</span>
							<span>{summary.hardPass} passed</span>
							<span>{summary.withGaps} with gaps</span>
							<span>${summary.spendUsd.toFixed(2)}</span>
						</>
					)}
				</div>
			</div>
			<span className={styles.open}>Open →</span>
		</button>
			<button
				type="button"
				className={styles.delete}
				title={`Delete ${campaign.name}`}
				onClick={() => onDelete(campaign)}
			>
				Delete
			</button>
		</div>
	);
}

export function ResearchPage() {
	const navigate = useNavigate();
	const [campaigns, setCampaigns] = useState<ResearchCampaignStatus[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [name, setName] = useState("");
	const [pack, setPack] = useState("property");
	const [compiling, setCompiling] = useState(false);
	const [starting, setStarting] = useState(false);
	const [preview, setPreview] = useState<ResearchPreview | null>(null);
	const [criteria, setCriteria] = useState<ResearchCriterion[]>([]);

	const load = useCallback(async () => {
		const result = await listCampaigns();
		setCampaigns(result.campaigns);
		setError(null);
	}, []);

	useEffect(() => {
		let active = true;
		const loadOnce = () => {
			void load().catch((err) => {
				if (active) setError(errText(err));
			});
		};
		loadOnce();
		const timer = setInterval(loadOnce, 5000);
		return () => {
			active = false;
			clearInterval(timer);
		};
	}, [load]);

	async function compilePreview(event: React.FormEvent) {
		event.preventDefault();
		if (!prompt.trim() || compiling) return;
		setCompiling(true);
		setError(null);
		try {
			const result = await previewCampaign({ prompt: prompt.trim(), pack });
			setPreview(result);
			setCriteria(result.criteria.map((criterion) => ({ ...criterion })));
		} catch (err) {
			setError(errText(err));
		} finally {
			setCompiling(false);
		}
	}

	async function remove(campaign: ResearchCampaignStatus) {
		if (
			!window.confirm(
				`Delete "${campaign.name}"? Its database, media, and exports are removed.`,
			)
		) {
			return;
		}
		setError(null);
		try {
			await deleteCampaign(campaign.id);
			await load();
		} catch (err) {
			setError(errText(err));
		}
	}

	async function start() {
		if (!preview || criteria.length === 0 || starting) return;
		setStarting(true);
		setError(null);
		try {
			const result = await createCampaign({
				brief: { ...preview.brief, criteria },
				name: name.trim() || undefined,
				pack,
			});
			setPreview(null);
			setPrompt("");
			setName("");
			navigate(`/research/${result.campaign.id}`);
		} catch (err) {
			setError(errText(err));
		} finally {
			setStarting(false);
		}
	}

	return (
		<div className={styles.page}>
			<div className={styles.inner}>
				<header className={styles.header}>
					<div>
						<h1>Research</h1>
						<p className={styles.subtitle}>
							Give it a brief. It proposes criteria, you review them, then it
							finds listings, records evidence, and ranks them against those
							criteria.
						</p>
					</div>
				</header>

				<form className={styles.form} onSubmit={compilePreview}>
					<label className={styles.label}>
						What are you looking for?
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="2-3 bed rental in Wellington under $650, near my work in the CBD, really want a carpark"
							rows={3}
						/>
					</label>
					<div className={styles.formRow}>
						<label className={styles.labelInline}>
							Name (optional)
							<input
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Flat hunt"
							/>
						</label>
						<label className={styles.labelInline}>
							Pack
							<select value={pack} onChange={(e) => setPack(e.target.value)}>
								<option value="property">Property</option>
							</select>
						</label>
						<button
							type="submit"
							className="btn btn-primary"
							disabled={!prompt.trim() || compiling}
						>
							{compiling ? "Compiling criteria…" : "Preview criteria"}
						</button>
					</div>
				</form>

				{error && <div className={styles.error}>{error}</div>}

				{campaigns === null ? (
					<div className={styles.empty}>Loading…</div>
				) : campaigns.length === 0 ? (
					<div className={styles.empty}>No research campaigns yet.</div>
				) : (
					<div className={styles.list}>
						{campaigns.map((campaign) => (
							<CampaignRow
								key={campaign.id}
								campaign={campaign}
								onDelete={(item) => void remove(item)}
							/>
						))}
					</div>
				)}
			</div>

			<Modal
				open={preview !== null}
				onClose={() => setPreview(null)}
				title="Review criteria"
				maxWidth={760}
				footer={
					<>
						<button
							type="button"
							className="btn btn-ghost"
							onClick={() => setPreview(null)}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							disabled={criteria.length === 0 || starting}
							onClick={() => void start()}
						>
							{starting ? "Starting…" : "Start research"}
						</button>
					</>
				}
			>
				{preview && (
					<div className={styles.preview}>
						<p className={styles.hint}>
							Explicit criteria came from your request. Suggested criteria are the
							harness's additions; remove any you don't want, or tune weights.
							After you start, it runs autonomously.
						</p>

						<div className={styles.previewCriteria}>
							{criteria.map((criterion) => (
								<div className={styles.criterionRow} key={criterion.key}>
									<div className={styles.criterionMain}>
										<div className={styles.criterionLabel}>
											<span>{criterion.label}</span>
											<span
												className={`${styles.badge} ${
													criterion.origin === "explicit"
														? styles.badgeExplicit
														: styles.badgeSuggested
												}`}
											>
												{criterion.origin}
											</span>
											{criterion.hard && (
												<span className={`${styles.badge} ${styles.badgeHard}`}>
													hard
												</span>
											)}
										</div>
										<div className={styles.criterionMeta}>
											{criterion.kind} · {sourceLabel(criterion)}
											{criterion.rationale ? ` — ${criterion.rationale}` : ""}
										</div>
									</div>
									<input
										className={styles.weightInput}
										type="number"
										min={0}
										max={1}
										step={0.05}
										value={criterion.weight}
										aria-label={`${criterion.label} weight`}
										onChange={(e) =>
											setCriteria((previous) =>
												previous.map((item) =>
													item.key === criterion.key
														? {
																...item,
																weight: clamp01(
																	Number(e.target.value),
																),
															}
														: item,
												),
											)
										}
									/>
									<button
										type="button"
										className="icon-btn"
										title={`Remove ${criterion.label}`}
										onClick={() =>
											setCriteria((previous) =>
												previous.filter((item) => item.key !== criterion.key),
											)
										}
									>
										✕
									</button>
								</div>
							))}
							{criteria.length === 0 && (
								<div className={styles.empty}>
									No criteria left. Add some in the prompt and preview again.
								</div>
							)}
						</div>

						{preview.warnings.length > 0 && (
							<div className={styles.warnings}>
								<strong>Warnings</strong>
								<ul>
									{preview.warnings.map((warning, index) => (
										<li key={index}>{warning}</li>
									))}
								</ul>
							</div>
						)}

						<details className={styles.echo}>
							<summary>Brief echo</summary>
							<pre>{preview.echo}</pre>
						</details>
					</div>
				)}
			</Modal>
		</div>
	);
}
