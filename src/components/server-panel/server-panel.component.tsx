import { useEffect, useState } from "react";
import { useMcp } from "react-opencode";
import { extractPlugins, fetchConfig, inspectPlugin, mcpEntries, OPENCODE_URL, type PluginInfo } from "../../server.ts";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./server-panel.module.scss";

type Tab = "mcp" | "plugins";

interface ServerPanelProps {
	open: boolean;
	onClose: () => void;
}

export function ServerPanel({ open, onClose }: ServerPanelProps) {
	const mcp = useMcp();
	const [tab, setTab] = useState<Tab>("mcp");
	const [plugins, setPlugins] = useState<PluginInfo[]>([]);
	const [error, setError] = useState<string | null>(null);
	// Flips once the plugin list has resolved, so `loading` is derived rather
	// than set synchronously in the effect.
	const [loaded, setLoaded] = useState(false);
	const loading = open && tab === "plugins" && !loaded;

	useEffect(() => {
		if (!open || tab !== "plugins" || loaded) return;
		let cancelled = false;
		fetchConfig(OPENCODE_URL)
			.then(extractPlugins)
			.then((specs) => Promise.all(specs.map((s) => inspectPlugin(OPENCODE_URL, s))))
			.then((infos) => {
				if (!cancelled) setPlugins(infos);
			})
			.catch((e) => {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			})
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [open, tab, loaded]);

	const mcpList = mcpEntries(mcp);

	return (
		<Modal open={open} onClose={onClose} title="Server" maxWidth={640}>
			<div className={styles.tabs}>
				<button
					type="button"
					className={`${styles.tab} ${tab === "mcp" ? styles.tabActive : ""}`}
					onClick={() => setTab("mcp")}
				>
					MCP{mcpList.length > 0 ? ` (${mcpList.length})` : ""}
				</button>
				<button
					type="button"
					className={`${styles.tab} ${tab === "plugins" ? styles.tabActive : ""}`}
					onClick={() => setTab("plugins")}
				>
					Plugins
				</button>
			</div>

			{tab === "mcp" ? (
				mcpList.length === 0 ? (
					<div className={styles.empty}>No MCP servers configured.</div>
				) : (
					<div className={styles.list}>
						{mcpList.map(({ name, server }) => (
							<div key={name} className={styles.row}>
								<span className={`status-dot status-dot-${server.status}`} />
								<span className={styles.name} title={name}>
									{name}
								</span>
								{server.error && (
									<span className={styles.rowError} title={server.error}>
										{server.error}
									</span>
								)}
								<span className={styles.status}>{server.status}</span>
							</div>
						))}
					</div>
				)
			) : loading ? (
				<div className={styles.empty}>Loading…</div>
			) : error ? (
				<div className={styles.error}>{error}</div>
			) : plugins.length === 0 ? (
				<div className={styles.empty}>No plugins configured.</div>
			) : (
				<div className={styles.list}>
					{plugins.map((p) => (
						<div key={p.spec} className={styles.row}>
							<span className={`status-dot status-dot-${p.status}`} />
							<span className={styles.name} title={p.spec}>
								{p.label}
							</span>
							{p.detail && (
								<span className={styles.rowError} title={p.detail}>
									{p.detail}
								</span>
							)}
							<span className={styles.status}>{p.status}</span>
						</div>
					))}
				</div>
			)}
		</Modal>
	);
}
