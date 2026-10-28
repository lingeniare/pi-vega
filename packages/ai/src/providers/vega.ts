import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openrouterImagesApi } from "../api/openrouter-images.lazy.ts";
import { envApiKeyAuth, lazyOAuth } from "../auth/helpers.ts";
import { loadVegaOAuth } from "../auth/oauth/load.ts";
import { createProvider, type Provider, type RefreshModelsContext } from "../models.ts";
import type { ImageModel, Model } from "../types.ts";
import { type OpenRouterModel, openRouterCost } from "./openrouter-api.ts";

const VEGA_BASE_URL = "https://api.vega.chat/api/v1";
const VEGA_MODELS_TIMEOUT_MS = 15_000;

/** VEGA is an OpenRouter-compatible gateway, so `/models` uses the OpenRouter shape. */
type VegaModelListItem = OpenRouterModel & {
	name?: string;
	supported_parameters?: string[];
	architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Keep only text-output chat models: VEGA app keys already restrict the listing
 * to `output_modalities=text`, and the same rule is applied client-side so plain
 * dashboard keys also surface text models only.
 */
function isVegaTextModel(model: VegaModelListItem): boolean {
	const output = model.architecture?.output_modalities;
	if (Array.isArray(output) && output.length > 0) return output.every((entry) => entry === "text");
	const modality = model.architecture?.modality;
	if (typeof modality === "string" && modality.includes("->")) return modality.endsWith("->text");
	return true;
}

function modalities(values: string[] | undefined): ("text" | "image")[] {
	return Array.from(
		new Set((values ?? []).filter((value): value is "text" | "image" => value === "text" || value === "image")),
	);
}

function vegaModelInput(architecture: VegaModelListItem["architecture"]): ("text" | "image")[] {
	const input = new Set(modalities(architecture?.input_modalities));
	if (input.size === 0) {
		input.add("text");
		if (architecture?.modality?.split("->")[0]?.includes("image")) input.add("image");
	}
	return [...input];
}

function toVegaModel(model: VegaModelListItem, baseUrl: string): Model<"openai-completions"> {
	return {
		type: "chat",
		id: model.id,
		name: model.name ?? model.id,
		api: "openai-completions",
		provider: "vega",
		baseUrl,
		reasoning: model.supported_parameters?.includes("reasoning") ?? false,
		input: vegaModelInput(model.architecture),
		cost: openRouterCost(model.pricing),
		contextWindow: model.top_provider?.context_length || model.context_length || 4096,
		maxTokens: model.top_provider?.max_completion_tokens || 4096,
		compat: {
			thinkingFormat: "openrouter",
			sendSessionAffinityHeaders: true,
			sessionAffinityFormat: "openrouter",
			supportsDeveloperRole: model.id.startsWith("anthropic/") || model.id.startsWith("openai/"),
		},
	};
}

function toVegaImageModel(model: VegaModelListItem, baseUrl: string): ImageModel<"openrouter-images"> {
	const input = modalities(model.architecture?.input_modalities);
	return {
		type: "image",
		id: model.id,
		name: model.name ?? model.id,
		api: "openrouter-images",
		provider: "vega",
		baseUrl,
		input: input.length > 0 ? input : ["text"],
		output: modalities(model.architecture?.output_modalities),
		cost: openRouterCost(model.pricing),
	};
}

async function fetchVegaModelList(
	baseUrl: string,
	key: string,
	signal: AbortSignal,
	query: string,
): Promise<unknown[]> {
	const response = await fetch(`${baseUrl}/models${query}`, {
		headers: { accept: "application/json", authorization: `Bearer ${key}` },
		signal,
	});
	if (!response.ok) throw new Error(`VEGA model list request failed: ${response.status}`);
	const body = asRecord(await response.json());
	if (!Array.isArray(body?.data)) throw new Error("Invalid VEGA model list response");
	return body.data;
}

/**
 * Fetch the key's model listings from `GET /models`. VEGA restricts the response
 * to the whitelist of the key's app (PIVEGA_ALLOWED_MODELS, empty = every text
 * model), so the returned catalog is already account-scoped. The default listing
 * omits image-only models, which the `output_modalities=image` listing adds like
 * OpenRouter; its failure leaves the chat catalog intact.
 */
async function fetchVegaModels(
	context: RefreshModelsContext,
): Promise<readonly (Model<"openai-completions"> | ImageModel<"openrouter-images">)[]> {
	const key = context.credential?.type === "oauth" ? context.credential.access : context.credential?.key;
	if (!key) throw new Error("VEGA model list requires a credential");
	const baseUrl = (context.baseUrl ?? VEGA_BASE_URL).replace(/\/+$/, "");
	const signal = AbortSignal.any([context.signal, AbortSignal.timeout(VEGA_MODELS_TIMEOUT_MS)]);

	const listed = await fetchVegaModelList(baseUrl, key, signal, "");
	const imageListed = await fetchVegaModelList(baseUrl, key, signal, "?output_modalities=image").catch(() => []);

	const images: ImageModel<"openrouter-images">[] = [];
	for (const entry of imageListed) {
		const item = entry as VegaModelListItem;
		if (typeof item.id !== "string" || images.some((existing) => existing.id === item.id)) continue;
		const output = modalities(item.architecture?.output_modalities);
		if (!output.includes("image")) continue;
		images.push(toVegaImageModel(item, baseUrl));
	}

	const chat = listed.flatMap((entry: unknown) => {
		const item = entry as VegaModelListItem;
		if (typeof item.id !== "string") return [];
		return isVegaTextModel(item) ? [toVegaModel(item, baseUrl)] : [];
	});
	return [...chat, ...images];
}

/** VEGA gateway provider with a persisted, dynamically refreshed text-model catalog. */
export function vegaProvider(): Provider<"openai-completions"> {
	return createProvider({
		id: "vega",
		name: "VEGA",
		baseUrl: VEGA_BASE_URL,
		auth: {
			apiKey: envApiKeyAuth("VEGA API key", ["VEGA_API_KEY"]),
			oauth: lazyOAuth({ name: "VEGA", loginLabel: "Sign in with VEGA", load: loadVegaOAuth }),
		},
		models: [],
		fetchModels: fetchVegaModels,
		api: openAICompletionsApi(),
		images: { "openrouter-images": openrouterImagesApi() },
	});
}
