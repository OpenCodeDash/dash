import { useConnected } from "react-opencode";
import styles from "./connection-banner.module.scss";

export function ConnectionBanner({ url }: { url: string }) {
	const connected = useConnected();
	if (connected) return null;
	return <div className={styles.banner}>Connecting to {url} …</div>;
}
