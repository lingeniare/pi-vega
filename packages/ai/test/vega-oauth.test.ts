import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryCredentialStore } from "../src/auth/credential-store.ts";
import { vegaOAuth } from "../src/auth/oauth/vega.ts";
import { createModels } from "../src/models.ts";
import { InMemoryModelsStore } from "../src/models-store.ts";
import { vegaProvider } from "../src/providers/vega.ts";

const neverAbortedSignal = new AbortController().signal;
const VEGA_MODELS_URL = "https://api.vega.chat/api/v1/models";

function jsonResponse(body: unknown, status: number = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getUrl(input: unknown): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	if (input instanceof Request) return input.url;
	throw new Error(`Unsupported fetch input: ${String(input)}`);
}

function getBody(init: RequestInit | undefined): Record<string, unknown> {
	if (typeof init?.body !== "string") throw new Error("Expected JSON string body");
	const parsed: unknown = JSON.parse(init.body);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid JSON body");
	return parsed as Record<string, unknown>;
}

function vegaModelListItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "openai/gpt-test",
		name: "GPT Test",
		context_length: 128_000,
		top_provider: { context_length: 128_000, max_completion_tokens: 16_000 },
		pricing: { prompt: "0.000001", completion: "0.000002" },
		supported_parameters: ["tools", "reasoning"],
		architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
		...overrides,
	};
}

describe("vegaOAuth", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("runs the device flow and mints an app API key", async () => {
		const seenBodies: Record<string, unknown>[] = [];
		let tokenPolls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
				const url = getUrl(input);
				seenBodies.push({ url, ...getBody(init) });
				if (url.endsWith("/api/auth/device/code")) {
					return jsonResponse({
						device_code: "device-code",
						user_code: "ABCD-EFGH",
						verification_uri: "https://api.vega.chat/device",
						verification_uri_complete: "https://api.vega.chat/device?user_code=ABCD-EFGH",
						interval: 1,
						expires_in: 600,
					});
				}
				if (url.endsWith("/api/auth/device/token")) {
					tokenPolls += 1;
					if (tokenPolls === 1) return jsonResponse({ error: "authorization_pending" }, 400);
					return jsonResponse({ access_token: "session-token" });
				}
				if (url.endsWith("/api/v1/keys/pivega")) {
					expect(init?.headers).toMatchObject({ authorization: "Bearer session-token" });
					return jsonResponse({ id: "key-id", key: "sk-apivega-test" });
				}
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		const deviceEvents: { userCode: string; verificationUri: string }[] = [];
		const credential = await vegaOAuth.login({
			signal: neverAbortedSignal,
			prompt: async () => {
				throw new Error("Unexpected prompt");
			},
			notify: (event) => {
				if (event.type === "device_code") {
					deviceEvents.push({ userCode: event.userCode, verificationUri: event.verificationUri });
				}
			},
		});

		expect(deviceEvents).toEqual([
			{ userCode: "ABCD-EFGH", verificationUri: "https://api.vega.chat/device?user_code=ABCD-EFGH" },
		]);
		expect(seenBodies).toContainEqual(expect.objectContaining({ client_id: "pivega", scope: "api" }));
		expect(seenBodies).toContainEqual(
			expect.objectContaining({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: "device-code",
				client_id: "pivega",
			}),
		);
		expect(credential).toMatchObject({ type: "oauth", access: "sk-apivega-test" });
		expect(await vegaOAuth.toAuth(credential)).toEqual({ apiKey: "sk-apivega-test" });
		// The minted key is permanent, so refresh keeps the credential.
		expect(await vegaOAuth.refresh(credential, neverAbortedSignal)).toBe(credential);
	});

	it("fails the login when the gateway rejects the key exchange", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown): Promise<Response> => {
				const url = getUrl(input);
				if (url.endsWith("/api/auth/device/code")) {
					return jsonResponse({
						device_code: "device-code",
						user_code: "ABCD-EFGH",
						verification_uri: "https://api.vega.chat/device",
						expires_in: 600,
					});
				}
				if (url.endsWith("/api/auth/device/token")) return jsonResponse({ access_token: "session-token" });
				if (url.endsWith("/api/v1/keys/pivega")) return jsonResponse({ error: "unauthorized" }, 401);
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		await expect(
			vegaOAuth.login({ signal: neverAbortedSignal, prompt: async () => "", notify: () => {} }),
		).rejects.toThrow("401");
	});
});

describe("vegaProvider", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches the key-scoped model catalog and keeps text-output models only", async () => {
		const store = new InMemoryCredentialStore();
		await store.modify("vega", async () => ({
			type: "oauth",
			refresh: "",
			access: "sk-apivega-test",
			expires: Number.MAX_SAFE_INTEGER,
		}));

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
				const url = getUrl(input);
				if (url === `${VEGA_MODELS_URL}?output_modalities=image`) {
					return jsonResponse({
						data: [
							vegaModelListItem({
								id: "openai/gpt-image-test",
								name: "GPT Image Test",
								architecture: {
									modality: "text->image",
									input_modalities: ["text"],
									output_modalities: ["image"],
								},
							}),
							vegaModelListItem({
								id: "google/gemini-image-test",
								name: "Gemini Image Test",
								architecture: {
									modality: "text+image->image+text",
									input_modalities: ["text", "image"],
									output_modalities: ["image", "text"],
								},
							}),
						],
					});
				}
				if (url === VEGA_MODELS_URL) {
					expect(init?.headers).toMatchObject({ authorization: "Bearer sk-apivega-test" });
					return jsonResponse({
						data: [
							vegaModelListItem({ id: "openai/gpt-test", name: "GPT Test" }),
							vegaModelListItem({
								id: "anthropic/claude-test",
								architecture: {
									modality: "text+image->text",
									input_modalities: ["text", "image"],
									output_modalities: ["text"],
								},
							}),
							vegaModelListItem({
								id: "openai/text-embedding-test",
								architecture: {
									modality: "text->embeddings",
									input_modalities: ["text"],
									output_modalities: ["embeddings"],
								},
							}),
						],
					});
				}
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		const modelsStore = new InMemoryModelsStore();
		const models = createModels({ credentials: store, modelsStore });
		models.setProvider(vegaProvider());
		const result = await models.refresh({ allowNetwork: true, force: true });
		expect(result.errors.size).toBe(0);

		const available = await models.getAvailable("vega");
		expect(available.map((model) => model.id)).toEqual(["openai/gpt-test", "anthropic/claude-test"]);
		const [gpt, claude] = available;
		expect(gpt).toMatchObject({
			provider: "vega",
			api: "openai-completions",
			baseUrl: "https://api.vega.chat/api/v1",
			reasoning: true,
			input: ["text"],
			contextWindow: 128_000,
			maxTokens: 16_000,
			cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
		});
		expect(claude?.input).toEqual(["text", "image"]);

		// Image-output models land in the image catalog, not the chat one.
		const imageModels = await models.getAvailableOfType("image", "vega");
		expect(imageModels.map((model) => model.id)).toEqual(["openai/gpt-image-test", "google/gemini-image-test"]);
		expect(imageModels[0]).toMatchObject({
			provider: "vega",
			api: "openrouter-images",
			baseUrl: "https://api.vega.chat/api/v1",
			input: ["text"],
			output: ["image"],
		});
		expect(imageModels[1]).toMatchObject({ input: ["text", "image"], output: ["image", "text"] });

		// The fetched catalog is persisted and restored without network access.
		const offline = createModels({ credentials: store, modelsStore });
		offline.setProvider(vegaProvider());
		const restored = await offline.refresh({ allowNetwork: false });
		expect(restored.errors.size).toBe(0);
		expect(offline.getModels("vega").map((model) => model.id)).toEqual(["openai/gpt-test", "anthropic/claude-test"]);
		expect(offline.getModelsOfType("image", "vega").map((model) => model.id)).toEqual([
			"openai/gpt-image-test",
			"google/gemini-image-test",
		]);
	});
});
