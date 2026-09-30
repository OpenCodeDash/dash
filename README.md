# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
	globalIgnores(["dist"]),
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			// Other configs...

			// Remove tseslint.configs.recommended and replace with this
			tseslint.configs.recommendedTypeChecked,
			// Alternatively, use this for stricter rules
			tseslint.configs.strictTypeChecked,
			// Optionally, add this for stylistic rules
			tseslint.configs.stylisticTypeChecked,

			// Other configs...
		],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.node.json", "./tsconfig.app.json"],
				tsconfigRootDir: import.meta.dirname,
			},
			// other options...
		},
	},
]);
```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
	globalIgnores(["dist"]),
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			// Other configs...
			// Enable lint rules for React
			reactX.configs["recommended-typescript"],
			// Enable lint rules for React DOM
			reactDom.configs.recommended,
		],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.node.json", "./tsconfig.app.json"],
				tsconfigRootDir: import.meta.dirname,
			},
			// other options...
		},
	},
]);
```

## E2E tests

Headless e2e suite in `e2e/`, driven over the Chrome DevTools Protocol with no external deps.

```sh
npm run test:e2e              # structural + lifecycle + subagent + bench + boards + tasks
npm run test:e2e -- --with-model   # also run model-backed checks (needs a working model)
```

Suites run independently: `e2e/run.mjs` wraps each in `runSuite`, so a crashing suite records a failure instead of aborting the rest.

Prereqs (all must be running):

| Service | Default | Needed by |
| --- | --- | --- |
| opencode server (`opencode serve`) | `:4096` | all suites |
| Vite dev server (`npm run dev`) | `:5173` | all suites |
| Headless Chromium with CDP (`chromium --headless --remote-debugging-port=9222`) | `:9222` | all suites |
| backdash server | `:3000` | boards + tasks suites (skipped when unreachable) |

Overrides via env: `API_URL`, `APP_URL`, `BOARD_URL`, `CDP_HOST`, `CDP_PORT`, `SHOT_DIR` (screenshot dir for `Client.shot`).
