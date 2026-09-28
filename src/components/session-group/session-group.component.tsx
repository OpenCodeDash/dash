import { useState, type ReactNode } from "react";
import type { Session } from "react-opencode";
import styles from "./session-group.module.scss";

export interface SessionGroupProps {
	directory: string;
	sessions: Session[];
	children: ReactNode;
}

function basename(dir: string): string {
	const clean = dir.replace(/\/+$/, "");
	if (!clean || clean === "/") return "/";
	const parts = clean.split("/");
	return parts[parts.length - 1] || clean;
}

export function SessionGroup({ directory, sessions, children }: SessionGroupProps) {
	const [open, setOpen] = useState(true);
	const label = basename(directory);

	return (
		<div className={styles.group}>
			<button type="button" className={styles.header} onClick={() => setOpen((o) => !o)}>
				<span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▸</span>
				<span className={styles.name} title={directory}>
					{label}
				</span>
				<span className={styles.count}>{sessions.length}</span>
			</button>
			{open && <div className={styles.children}>{children}</div>}
		</div>
	);
}
