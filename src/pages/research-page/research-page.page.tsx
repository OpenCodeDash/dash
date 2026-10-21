import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/modal/modal.component.tsx";
import {
	createCampaign,
	listCampaigns,
	previewCampaign,
	type ResearchCampaignStatus,
	type ResearchCriterion,
	type ResearchPreview,
	type ResearchSourceScope,
	type ResearchWebScope,
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

interface SourceScopeForm {
	web: ResearchWebScope;
	allow: string;
	deny: string;
	prefer: string;
}

function splitList(value: string): string[] {
	return [
		...new Set(
			value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean),
		),
	];
}

function sourceScopeForm(scope: ResearchSourceScope | undefined): SourceScopeForm {
	return {
		web: scope?.web ?? "open",
		allow: (scope?.allow ?? []).join(", "),
		deny: (scope?.deny ?? []).join(", "),
		prefer: (scope?.prefer ?? []).join(", "),
	};
}

function sourceScopeValue(form: SourceScopeForm): ResearchSourceScope {
	const allow = splitList(form.allow);
	const deny = splitList(form.deny);
	const prefer = splitList(form.prefer);
	return {
		web: form.web,
		...(allow.length ? { allow } : {}),
		...(deny.length ? { deny } : {}),
		...(prefer.length ? { prefer } : {}),
	};
}

function numberOr(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function harnessBrief(
	preview: ResearchPreview,
	criteria: ResearchCriterion[],
	sources: SourceScopeForm,
	htmlMax: number | undefined,
): Record<string, unknown> {
	const brief = preview.brief;
	const anchors = (brief.anchors ?? {}) as {
		work?: unknown;
		commute?: Record<string, unknown>;
	};
	const hard = (brief.hard ?? {}) as Record<string, unknown>;
	const budgets = (brief.budgets ?? {}) as Record<string, unknown>;
	const commute = anchors.commute;
	return {
		version: brief.version,
		domain: brief.domain,
		prompt: brief.prompt,
		anchors: {
			work: anchors.work,
			...(commute
				? {
						commute: {
							mode: commute.mode,
							max_minutes:
								numberOr(commute.maxMinutes) ??
								numberOr(commute.max_minutes),
							hard: commute.hard,
						},
					}
				: {}),
		},
		hard: {
			rent_max: numberOr(hard.rentMax) ?? numberOr(hard.rent_max),
			bedrooms: hard.bedrooms,
			areas: hard.areas,
			required: hard.required,
		},
		criteria,
		unknown_policy: brief.unknownPolicy ?? brief.unknown_policy,
		sources: sourceScopeValue(sources),
		budgets: {
			max_listings:
				numberOr(budgets.maxListings) ?? numberOr(budgets.max_listings),
			max_usd: numberOr(budgets.maxUsd) ?? numberOr(budgets.max_usd),
			max_minutes:
				numberOr(budgets.maxMinutes) ?? numberOr(budgets.max_minutes),
			vision_max:
				numberOr(budgets.visionMax) ?? numberOr(budgets.vision_max),
			html_max:
				htmlMax ?? numberOr(budgets.htmlMax) ?? numberOr(budgets.html_max),
		},
		assumptions: brief.assumptions,
		warnings: brief.warnings,
	};
}

function CampaignRow({ campaign }: { campaign: ResearchCampaignStatus }) {
	const navigate = useNavigate();
	const summary = campaign.lastSummary;

	return (
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
	const [sources, setSources] = useState<SourceScopeForm>({
		web: "open",
		allow: "",
		deny: "",
		prefer: "",
	});
	const [htmlMax, setHtmlMax] = useState("");

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
			setSources(sourceScopeForm(result.brief.sources));
			setHtmlMax(
				typeof result.brief.budgets?.htmlMax === "number"
					? String(result.brief.budgets.htmlMax)
					: "",
			);
		} catch (err) {
			setError(errText(err));
		} finally {
			setCompiling(false);
		}
	}

	async function start() {
		if (!preview || criteria.length === 0 || starting) return;
		setStarting(true);
		setError(null);
		try {
			const parsedHtmlMax = htmlMax.trim() ? Number(htmlMax) : undefined;
			const result = await createCampaign({
				brief: harnessBrief(
					preview,
					criteria,
					sources,
					parsedHtmlMax !== undefined && Number.isFinite(parsedHtmlMax)
						? Math.max(0, Math.floor(parsedHtmlMax))
						: undefined,
				),
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
								<option value="generic">Generic (anything)</option>
								<option value="property">Property / rentals</option>
								<option value="cars">Cars / vehicles</option>
								<option value="laptops">Laptops / computers</option>
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
							<CampaignRow key={campaign.id} campaign={campaign} />
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

						<details className={styles.sourceScope}>
							<summary>Sources &amp; budget</summary>
							<div className={styles.sourceGrid}>
								<label className={styles.labelInline}>
									Web
									<select
										value={sources.web}
										onChange={(e) =>
											setSources((previous) => ({
												...previous,
												web: e.target.value as ResearchWebScope,
											}))
										}
									>
										<option value="open">Open web</option>
										<option value="structured-only">Structured only</option>
										<option value="off">Allowed sources only</option>
									</select>
								</label>
								<label className={styles.labelInline}>
									HTML fallback max
									<input
										type="number"
										min={0}
										step={1}
										value={htmlMax}
										placeholder="25"
										onChange={(e) => setHtmlMax(e.target.value)}
									/>
								</label>
								<label className={styles.labelInline}>
									Allow
									<input
										value={sources.allow}
										placeholder="trademe, trademe.co.nz"
										onChange={(e) =>
											setSources((previous) => ({
												...previous,
												allow: e.target.value,
											}))
										}
									/>
								</label>
								<label className={styles.labelInline}>
									Deny
									<input
										value={sources.deny}
										placeholder="facebook.com"
										onChange={(e) =>
											setSources((previous) => ({
												...previous,
												deny: e.target.value,
											}))
										}
									/>
								</label>
								<label className={styles.labelInline}>
									Prefer
									<input
										value={sources.prefer}
										placeholder="trademe"
										onChange={(e) =>
											setSources((previous) => ({
												...previous,
												prefer: e.target.value,
											}))
										}
									/>
								</label>
							</div>
							<p className={styles.hint}>
								Open web is the default. Use “allowed sources only” to forbid
								anything outside the allow list.
							</p>
						</details>

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
