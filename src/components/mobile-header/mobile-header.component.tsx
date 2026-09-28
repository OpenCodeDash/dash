import styles from "./mobile-header.module.scss";

export function MobileHeader({ onMenu }: { onMenu: () => void }) {
	return (
		<header className={styles.header}>
			<button type="button" className={styles.menu} onClick={onMenu} aria-label="Open menu">
				☰
			</button>
			<span className={styles.title}>OpenCode</span>
			<span className={styles.spacer} />
		</header>
	);
}
