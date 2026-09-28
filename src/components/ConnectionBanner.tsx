import { useConnected } from "react-opencode";

export function ConnectionBanner({ url }: { url: string }) {
	const connected = useConnected();
	if (connected) return null;
	return <div className="conn-banner">Connecting to {url} …</div>;
}
