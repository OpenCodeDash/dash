import { useCallback, useEffect, useState } from "react";
import {
	createServiceAccount,
	createUser,
	fetchMe,
	listServiceAccounts,
	revokeServiceAccount,
	type AuthAccount,
	type AuthSession,
} from "../../auth.ts";
import { ConfirmDialog } from "../../components/confirm-dialog/confirm-dialog.component.tsx";
import styles from "./settings-page.module.scss";

function errText(err: unknown): string {
	return err instanceof Error ? err.message : "Something went wrong";
}

function formatWhen(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function SecretRow({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard unavailable; the value is still shown to copy by hand
		}
	}

	return (
		<div className={styles.secret}>
			<span className={styles.secretLabel}>{label}</span>
			<code className={styles.secretValue}>{value}</code>
			<button type="button" className="btn" onClick={() => void copy()}>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

export function SettingsPage({ token }: { token: string }) {
	const [me, setMe] = useState<AuthAccount | null>(null);
	const [meError, setMeError] = useState<string | null>(null);

	const [services, setServices] = useState<AuthAccount[] | null>(null);
	const [svcError, setSvcError] = useState<string | null>(null);
	const [revokeTarget, setRevokeTarget] = useState<AuthAccount | null>(null);

	const [uName, setUName] = useState("");
	const [uPass, setUPass] = useState("");
	const [uAdmin, setUAdmin] = useState(false);
	const [uBusy, setUBusy] = useState(false);
	const [uError, setUError] = useState<string | null>(null);
	const [uResult, setUResult] = useState<AuthSession | null>(null);

	const [sName, setSName] = useState("");
	const [sBusy, setSBusy] = useState(false);
	const [sError, setSError] = useState<string | null>(null);
	const [sResult, setSResult] = useState<AuthSession | null>(null);

	const isAdmin = me?.isAdmin ?? false;

	useEffect(() => {
		let active = true;
		fetchMe(token)
			.then((account) => {
				if (active) setMe(account);
			})
			.catch((err) => {
				if (active) setMeError(errText(err));
			});
		return () => {
			active = false;
		};
	}, [token]);

	const loadServices = useCallback(async () => {
		try {
			setServices(await listServiceAccounts(token));
			setSvcError(null);
		} catch (err) {
			setSvcError(errText(err));
		}
	}, [token]);

	useEffect(() => {
		if (!isAdmin) return;
		let active = true;
		listServiceAccounts(token)
			.then((list) => {
				if (active) {
					setServices(list);
					setSvcError(null);
				}
			})
			.catch((err) => {
				if (active) setSvcError(errText(err));
			});
		return () => {
			active = false;
		};
	}, [isAdmin, token]);

	function submitUser(e: React.FormEvent) {
		e.preventDefault();
		if (!uName.trim() || !uPass || uBusy) return;
		setUBusy(true);
		setUError(null);
		setUResult(null);
		void createUser(token, uName.trim(), uPass, uAdmin)
			.then((session) => {
				setUResult(session);
				setUName("");
				setUPass("");
				setUAdmin(false);
			})
			.catch((err) => setUError(errText(err)))
			.finally(() => setUBusy(false));
	}

	function submitService(e: React.FormEvent) {
		e.preventDefault();
		if (!sName.trim() || sBusy) return;
		setSBusy(true);
		setSError(null);
		setSResult(null);
		void createServiceAccount(token, sName.trim())
			.then((session) => {
				setSResult(session);
				setSName("");
				void loadServices();
			})
			.catch((err) => setSError(errText(err)))
			.finally(() => setSBusy(false));
	}

	function confirmRevoke() {
		const target = revokeTarget;
		if (!target) return;
		setRevokeTarget(null);
		void revokeServiceAccount(token, target.id)
			.then(() => void loadServices())
			.catch((err) => setSvcError(errText(err)));
	}

	return (
		<div className={styles.page}>
			<div className={styles.inner}>
				<h1>Settings</h1>

				<section className={styles.section}>
					<h2>Account</h2>
					{meError ? (
						<p className={styles.error}>{meError}</p>
					) : me ? (
						<dl className={styles.facts}>
							<div className={styles.fact}>
								<dt>Name</dt>
								<dd>{me.name}</dd>
							</div>
							<div className={styles.fact}>
								<dt>Kind</dt>
								<dd>
									<span className={styles.badge}>{me.kind}</span>
									{me.isAdmin && (
										<span className={`${styles.badge} ${styles.admin}`}>admin</span>
									)}
								</dd>
							</div>
							<div className={styles.fact}>
								<dt>Created</dt>
								<dd>{formatWhen(me.createdAt)}</dd>
							</div>
						</dl>
					) : (
						<p className={styles.hint}>Loading account…</p>
					)}
				</section>

				{isAdmin && (
					<section className={styles.section}>
						<h2>New user</h2>
						<form className={styles.form} onSubmit={submitUser}>
							<input
								className={styles.grow}
								value={uName}
								placeholder="Name"
								aria-label="New user name"
								autoComplete="off"
								onChange={(e) => setUName(e.target.value)}
							/>
							<input
								className={styles.grow}
								type="password"
								value={uPass}
								placeholder="Password"
								aria-label="New user password"
								autoComplete="new-password"
								onChange={(e) => setUPass(e.target.value)}
							/>
							<label className={styles.check}>
								<input
									type="checkbox"
									checked={uAdmin}
									onChange={(e) => setUAdmin(e.target.checked)}
								/>
								Admin
							</label>
							<button
								type="submit"
								className="btn btn-primary"
								disabled={!uName.trim() || !uPass || uBusy}
							>
								{uBusy ? "Creating…" : "Create user"}
							</button>
						</form>
						{uError && <p className={styles.error}>{uError}</p>}
						{uResult && (
							<div className={styles.created}>
								<p className={styles.note}>
									User <strong>{uResult.account.name}</strong> created. This bearer token is shown
									only once — copy it now:
								</p>
								<SecretRow label="Bearer token" value={uResult.token} />
							</div>
						)}
					</section>
				)}

				{isAdmin && (
					<section className={styles.section}>
						<h2>Service accounts</h2>
						<p className={styles.hint}>
							Service accounts let agents connect through the backdash API. Their token is shown only
							once, when the account is created — to rotate it, revoke the account and create a new one.
						</p>
						<form className={styles.form} onSubmit={submitService}>
							<input
								className={styles.grow}
								value={sName}
								placeholder="Service account name"
								aria-label="Service account name"
								autoComplete="off"
								onChange={(e) => setSName(e.target.value)}
							/>
							<button
								type="submit"
								className="btn btn-primary"
								disabled={!sName.trim() || sBusy}
							>
								{sBusy ? "Creating…" : "Create"}
							</button>
						</form>
						{sError && <p className={styles.error}>{sError}</p>}
						{sResult && (
							<div className={styles.created}>
								<p className={styles.note}>
									Service account <strong>{sResult.account.name}</strong> created. This bearer token
									is shown only once — copy it now to connect an agent or plugin:
								</p>
								<SecretRow label="Bearer token" value={sResult.token} />
							</div>
						)}

						{svcError && <p className={styles.error}>{svcError}</p>}
						{services === null ? (
							<p className={styles.hint}>Loading service accounts…</p>
						) : services.length === 0 ? (
							<p className={styles.empty}>No service accounts yet.</p>
						) : (
							<ul className={styles.list}>
								{services.map((svc) => (
									<li key={svc.id} className={styles.item}>
										<span className={styles.itemName}>{svc.name}</span>
										<span className={styles.itemMeta}>
											created {formatWhen(svc.createdAt)}
										</span>
										<button
											type="button"
											className="btn btn-danger"
											onClick={() => setRevokeTarget(svc)}
										>
											Revoke
										</button>
									</li>
								))}
							</ul>
						)}
					</section>
				)}
			</div>

			<ConfirmDialog
				open={revokeTarget !== null}
				title="Revoke service account"
				message={
					revokeTarget
						? `Revoke "${revokeTarget.name}"? Agents using its token will immediately lose access.`
						: ""
				}
				confirmLabel="Revoke"
				danger
				onConfirm={confirmRevoke}
				onCancel={() => setRevokeTarget(null)}
			/>
		</div>
	);
}
