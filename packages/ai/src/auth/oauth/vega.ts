/**
 * VEGA OAuth flow (api.vega.chat)
 *
 * RFC 8628 device flow against the VEGA gateway with `client_id: "pivega"`: the
 * user confirms the code at https://api.vega.chat/device, the client polls for a
 * session token, then exchanges it for an app API key (`sk-apivega-...`) at
 * `POST /api/v1/keys/pivega`. Like OpenRouter, the minted key does not expire,
 * so `refresh` is a no-op; a revoked key fails at request time and the user
 * logs in again.
 */

import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from "../types.ts";
import { pollOAuthDeviceCodeFlow } from "./device-code.ts";
import { trustedHttpUrl } from "./trusted-url.ts";

const VEGA_ORIGIN = "https://api.vega.chat";
const VEGA_CLIENT_ID = "pivega";

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	interval?: number;
	expires_in: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function vegaErrorDetail(body: Record<string, unknown> | undefined): string | undefined {
	if (typeof body?.error_description === "string") return body.error_description;
	if (typeof body?.message === "string") return body.message;
	if (typeof body?.error === "string") return body.error;
	const error = asRecord(body?.error);
	return typeof error?.message === "string" ? error.message : undefined;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
	const response = await fetch(url, init);
	const body: unknown = await response.json().catch(() => undefined);
	if (!response.ok) {
		const detail = vegaErrorDetail(asRecord(body));
		throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
	}
	return body;
}

async function startVegaDeviceFlow(signal: AbortSignal): Promise<DeviceCodeResponse> {
	const data = asRecord(
		await fetchJson(`${VEGA_ORIGIN}/api/auth/device/code`, {
			method: "POST",
			headers: { accept: "application/json", "content-type": "application/json" },
			body: JSON.stringify({ client_id: VEGA_CLIENT_ID, scope: "api" }),
			signal,
		}),
	);

	const deviceCode = data?.device_code;
	const userCode = data?.user_code;
	const expiresIn = data?.expires_in;
	const interval = data?.interval;
	const verificationUri = trustedHttpUrl(data?.verification_uri_complete) ?? trustedHttpUrl(data?.verification_uri);

	if (
		typeof deviceCode !== "string" ||
		typeof userCode !== "string" ||
		typeof verificationUri !== "string" ||
		(interval !== undefined && typeof interval !== "number") ||
		typeof expiresIn !== "number"
	) {
		throw new Error("Invalid VEGA device code response");
	}

	return {
		device_code: deviceCode,
		user_code: userCode,
		verification_uri: verificationUri,
		interval,
		expires_in: expiresIn,
	};
}

async function pollForVegaSessionToken(device: DeviceCodeResponse, signal: AbortSignal): Promise<string> {
	return pollOAuthDeviceCodeFlow<string>({
		intervalSeconds: device.interval,
		expiresInSeconds: device.expires_in,
		waitBeforeFirstPoll: true,
		signal,
		poll: async () => {
			// Pending answers arrive as HTTP 400 with an OAuth error body, so the
			// response is read regardless of status.
			const response = await fetch(`${VEGA_ORIGIN}/api/auth/device/token`, {
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/json" },
				body: JSON.stringify({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: device.device_code,
					client_id: VEGA_CLIENT_ID,
				}),
				signal,
			});
			const raw = asRecord(await response.json().catch(() => undefined));

			if (typeof raw?.access_token === "string") {
				return { status: "complete", value: raw.access_token };
			}

			const error = typeof raw?.error === "string" ? raw.error : undefined;
			if (error === "authorization_pending") {
				return { status: "pending" };
			}
			if (error === "slow_down") {
				return {
					status: "slow_down",
					intervalSeconds: typeof raw?.interval === "number" ? raw.interval : undefined,
				};
			}

			const detail = vegaErrorDetail(raw);
			return {
				status: "failed",
				message: `VEGA device flow failed${detail ? `: ${detail}` : ` (HTTP ${response.status})`}`,
			};
		},
	});
}

/** Exchange the session token for a permanent app API key (`sk-apivega-...`). */
async function mintVegaApiKey(sessionToken: string, signal: AbortSignal): Promise<string> {
	const data = asRecord(
		await fetchJson(`${VEGA_ORIGIN}/api/v1/keys/${VEGA_CLIENT_ID}`, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				authorization: `Bearer ${sessionToken}`,
			},
			body: JSON.stringify({}),
			signal,
		}),
	);
	if (typeof data?.key !== "string" || data.key.length === 0) {
		throw new Error("Invalid VEGA key exchange response");
	}
	return data.key;
}

async function loginVega(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
	const device = await startVegaDeviceFlow(interaction.signal);
	interaction.notify({
		type: "device_code",
		userCode: device.user_code,
		verificationUri: device.verification_uri,
		intervalSeconds: device.interval,
		expiresInSeconds: device.expires_in,
	});

	const sessionToken = await pollForVegaSessionToken(device, interaction.signal);
	interaction.notify({ type: "progress", message: "Creating VEGA API key..." });
	const apiKey = await mintVegaApiKey(sessionToken, interaction.signal);

	return {
		type: "oauth",
		access: apiKey,
		refresh: "",
		expires: Number.MAX_SAFE_INTEGER,
	};
}

export const vegaOAuth: OAuthAuth = {
	name: "VEGA",
	loginLabel: "Sign in with VEGA",
	login: loginVega,
	async refresh(credential, _signal) {
		return credential;
	},
	async toAuth(credential) {
		return { apiKey: credential.access };
	},
};
