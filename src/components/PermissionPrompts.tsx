import { useClientActions, usePermissions } from "react-opencode";

export function PermissionPrompts({ sessionId }: { sessionId: string }) {
	const permissions = usePermissions().filter((p) => p.sessionID === sessionId);
	const { replyPermission } = useClientActions();

	if (permissions.length === 0) return null;

	return (
		<div className="prompt-cards">
			{permissions.map((p) => (
				<div key={p.id} className="prompt-card">
					<div className="prompt-card-title">Allow {p.permission}?</div>
					{p.patterns.length > 0 && <pre className="prompt-pre">{p.patterns.join("\n")}</pre>}
					{p.metadata && Object.keys(p.metadata).length > 0 && (
						<pre className="prompt-pre">{JSON.stringify(p.metadata, null, 2)}</pre>
					)}
					<div className="prompt-card-actions">
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => void replyPermission(p.id, "once").catch(() => undefined)}
						>
							Allow once
						</button>
						<button
							type="button"
							className="btn"
							onClick={() => void replyPermission(p.id, "always").catch(() => undefined)}
						>
							Always
						</button>
						<button
							type="button"
							className="btn btn-danger"
							onClick={() => void replyPermission(p.id, "reject").catch(() => undefined)}
						>
							Reject
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
