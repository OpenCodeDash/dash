import { useCallback, useEffect, useRef, useState } from "react";

export type Theme = "dark" | "light";

// Kept in sync with the inline bootstrap script in index.html. That script
// applies the same resolution before first paint so there is no theme flash;
// this hook then owns the value. The system preference is followed on every
// load until the user explicitly toggles, at which point that choice sticks.
export const THEME_STORAGE_KEY = "dash-theme";

function prefersLight(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
}

function readInitialTheme(): Theme {
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === "dark" || stored === "light") return stored;
	} catch {
		// localStorage can throw in private/blocked contexts — fall through.
	}
	return prefersLight() ? "light" : "dark";
}

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(readInitialTheme);
	// Only an explicit toggle is persisted, so an untouched app keeps following
	// the OS preference on the next load.
	const hasChosen = useRef(false);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		if (hasChosen.current) {
			try {
				localStorage.setItem(THEME_STORAGE_KEY, theme);
			} catch {
				// Persisting is best-effort.
			}
		}
	}, [theme]);

	const toggleTheme = useCallback(() => {
		hasChosen.current = true;
		setTheme((current) => (current === "dark" ? "light" : "dark"));
	}, []);

	return { theme, toggleTheme };
}
