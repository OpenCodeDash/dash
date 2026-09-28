import { Navigate, Route, Routes } from "react-router-dom";
import { OpenCodeProvider } from "react-opencode";
import { OPENCODE_URL } from "./server.ts";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Home } from "./components/Home.tsx";
import { SessionView } from "./components/SessionView.tsx";

export default function App() {
	return (
		<OpenCodeProvider url={OPENCODE_URL}>
			<div className="app">
				<Sidebar />
				<main className="main">
					<ConnectionBanner url={OPENCODE_URL} />
					<Routes>
						<Route index element={<Home />} />
						<Route path="session/:sessionId" element={<SessionView />} />
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</main>
			</div>
		</OpenCodeProvider>
	);
}
