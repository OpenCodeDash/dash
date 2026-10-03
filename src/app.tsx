import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BackdashProvider } from "react-backdash";
import { OpenCodeProvider } from "react-opencode";
import { BACKDASH_URL, OPENCODE_URL } from "./server.ts";
import { authHeaders, getStoredToken, storeToken, validateToken } from "./auth.ts";
import styles from "./app.module.scss";
import { AuthGate } from "./components/auth-gate/auth-gate.component.tsx";
import { ConnectionBanner } from "./components/connection-banner/connection-banner.component.tsx";
import { DirectoryPicker } from "./components/directory-picker/directory-picker.component.tsx";
import { MobileHeader } from "./components/mobile-header/mobile-header.component.tsx";
import { ServerPanel } from "./components/server-panel/server-panel.component.tsx";
import { Sidebar } from "./components/sidebar/sidebar.component.tsx";
import { BoardPage } from "./pages/board-page/board-page.page.tsx";
import { BoardsPage } from "./pages/boards-page/boards-page.page.tsx";
import { HomePage } from "./pages/home-page/home-page.page.tsx";
import { SessionPage } from "./pages/session-page/session-page.page.tsx";
import { SettingsPage } from "./pages/settings-page/settings-page.page.tsx";

export default function App() {
	const [token, setToken] = useState<string | null>(() => getStoredToken());
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [serverOpen, setServerOpen] = useState(false);

	// Drop a stored token the server no longer accepts (expired/revoked), so the
	// user is returned to the sign-in screen instead of seeing empty boards.
	useEffect(() => {
		if (!token) return;
		let active = true;
		void validateToken(token).then((account) => {
			if (active && !account) {
				storeToken(null);
				setToken(null);
			}
		});
		return () => {
			active = false;
		};
	}, [token]);

	const handleAuthenticated = useCallback((next: string) => {
		storeToken(next);
		setToken(next);
	}, []);

	const handleSignOut = useCallback(() => {
		storeToken(null);
		setToken(null);
	}, []);

	const closeSidebar = useCallback(() => setSidebarOpen(false), []);
	const openSidebar = useCallback(() => setSidebarOpen(true), []);
	const openPicker = useCallback(() => {
		setSidebarOpen(false);
		setPickerOpen(true);
	}, []);
	const openServer = useCallback(() => {
		setSidebarOpen(false);
		setServerOpen(true);
	}, []);
	const closePicker = useCallback(() => setPickerOpen(false), []);
	const closeServer = useCallback(() => setServerOpen(false), []);

	if (!token) {
		return <AuthGate onAuthenticated={handleAuthenticated} />;
	}

	return (
		<OpenCodeProvider url={OPENCODE_URL}>
			<BackdashProvider url={BACKDASH_URL} headers={authHeaders(token)}>
				<div className={styles.app}>
					{sidebarOpen && <div className={styles.scrim} onClick={closeSidebar} />}
					<Sidebar
						open={sidebarOpen}
						onNewSession={openPicker}
						onShowServer={openServer}
						onSignOut={handleSignOut}
					/>
					<div className={styles.main}>
						<MobileHeader onMenu={openSidebar} />
						<ConnectionBanner url={OPENCODE_URL} />
						<Routes>
							<Route index element={<HomePage onNewSession={openPicker} />} />
							<Route path="session/:sessionId" element={<SessionPage />} />
							<Route path="boards" element={<BoardsPage />} />
							<Route path="boards/:boardId" element={<BoardPage />} />
							<Route path="settings" element={<SettingsPage token={token} />} />
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</div>
					<DirectoryPicker open={pickerOpen} onClose={closePicker} />
					<ServerPanel open={serverOpen} onClose={closeServer} />
				</div>
			</BackdashProvider>
		</OpenCodeProvider>
	);
}
