import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	createCampaign,
	listCampaigns,
	type ResearchCampaignStatus,
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
	const [starting, setStarting] = useState(false);

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

	async function start(event: React.FormEvent) {
		event.preventDefault();
		if (!prompt.trim() || starting) return;
		setStarting(true);
		setError(null);
		try {
			const result = await createCampaign({
				prompt: prompt.trim(),
				name: name.trim() || undefined,
				pack,
			});
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
							Give it a brief. It finds listings, records evidence, ranks them
							against your priorities, and keeps the result steerable.
						</p>
					</div>
				</header>

				<form className={styles.form} onSubmit={start}>
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
							disabled={!prompt.trim() || starting}
						>
							{starting ? "Starting…" : "Start research"}
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
		</div>
	);
}
