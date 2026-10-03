import { useState } from "react";
import { login, register } from "../../auth.ts";
import styles from "./auth-gate.module.scss";

type Mode = "login" | "register";

export function AuthGate({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
	const [mode, setMode] = useState<Mode>("login");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const valid = name.trim().length > 0 && password.length > 0;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!valid || busy) return;
		setBusy(true);
		setError(null);
		try {
			const session =
				mode === "login"
					? await login(name.trim(), password)
					: await register(name.trim(), password);
			onAuthenticated(session.token);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={styles.page}>
			<form className={styles.card} onSubmit={submit}>
				<h1 className={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</h1>
				<p className={styles.subtitle}>Boards and tasks require a backdash account.</p>

				<label className={styles.field}>
					<span className={styles.label}>Name</span>
					<input
						className={styles.input}
						value={name}
						autoFocus
						autoComplete="username"
						onChange={(e) => setName(e.target.value)}
					/>
				</label>

				<label className={styles.field}>
					<span className={styles.label}>Password</span>
					<input
						className={styles.input}
						type="password"
						value={password}
						autoComplete={mode === "login" ? "current-password" : "new-password"}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</label>

				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}

				<button type="submit" className="btn btn-primary" disabled={!valid || busy}>
					{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
				</button>

				<button
					type="button"
					className={styles.switch}
					onClick={() => {
						setMode(mode === "login" ? "register" : "login");
						setError(null);
					}}
				>
					{mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
				</button>
			</form>
		</div>
	);
}
