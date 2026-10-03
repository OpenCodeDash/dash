import { BACKDASH_URL } from "./server.ts";

const TOKEN_KEY = "backdash.token";

export interface AuthAccount {
	id: string;
	name: string;
	kind: "user" | "service";
	isAdmin: boolean;
	createdAt: string;
}

export interface AuthSession {
	account: AuthAccount;
	token: string;
}

export function getStoredToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function storeToken(token: string | null): void {
	try {
		if (token) localStorage.setItem(TOKEN_KEY, token);
		else localStorage.removeItem(TOKEN_KEY);
	} catch {
		// storage unavailable (private mode); the session just won't persist
	}
}

export function authHeaders(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}

function messageFrom(data: unknown, status: number): string {
	if (data && typeof data === "object" && "message" in data) {
		const message = (data as { message: unknown }).message;
		if (typeof message === "string") return message;
	}
	return `Request failed (${status})`;
}

async function postAuth(path: string, body: object): Promise<AuthSession> {
	const res = await fetch(`${BACKDASH_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data: unknown = await res.json().catch(() => null);
	if (!res.ok) throw new Error(messageFrom(data, res.status));
	return data as AuthSession;
}

export function register(name: string, password: string): Promise<AuthSession> {
	return postAuth("/auth/register", { name, password });
}

export function login(name: string, password: string): Promise<AuthSession> {
	return postAuth("/auth/login", { name, password });
}

/** Returns the account for a token, or null when the token is missing/invalid. */
export async function validateToken(token: string): Promise<AuthAccount | null> {
	try {
		const res = await fetch(`${BACKDASH_URL}/auth/me`, {
			headers: authHeaders(token),
		});
		if (!res.ok) return null;
		return (await res.json()) as AuthAccount;
	} catch {
		return null;
	}
}

/**
 * Issue an authenticated backdash request and parse the JSON body. Throws with
 * the server-provided message on a non-2xx response so callers can surface it.
 */
async function authRequest<T>(
	token: string,
	path: string,
	init: RequestInit = {}
): Promise<T> {
	const res = await fetch(`${BACKDASH_URL}${path}`, {
		...init,
		headers: {
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...authHeaders(token),
		},
	});
	const data: unknown = await res.json().catch(() => null);
	if (!res.ok) throw new Error(messageFrom(data, res.status));
	return data as T;
}

/** The account the bearer token belongs to. */
export function fetchMe(token: string): Promise<AuthAccount> {
	return authRequest<AuthAccount>(token, "/auth/me");
}

/** Admin-only: provision a user account. The token is returned once. */
export function createUser(
	token: string,
	name: string,
	password: string,
	isAdmin: boolean
): Promise<AuthSession> {
	return authRequest<AuthSession>(token, "/auth/users", {
		method: "POST",
		body: JSON.stringify({ name, password, isAdmin }),
	});
}

/** Admin-only: provision a service account. The token is returned once. */
export function createServiceAccount(
	token: string,
	name: string
): Promise<AuthSession> {
	return authRequest<AuthSession>(token, "/auth/service", {
		method: "POST",
		body: JSON.stringify({ name }),
	});
}

/** Admin-only: list all service accounts. */
export function listServiceAccounts(token: string): Promise<AuthAccount[]> {
	return authRequest<AuthAccount[]>(token, "/auth/service");
}

/** Admin-only: revoke a service account. */
export function revokeServiceAccount(token: string, id: string): Promise<void> {
	return authRequest<void>(token, `/auth/service/${id}`, { method: "DELETE" });
}
