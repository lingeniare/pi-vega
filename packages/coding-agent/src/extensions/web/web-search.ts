/**
 * The `web_search` tool: search the web through the OpenRouter-compatible server tool
 * `openrouter:web_search` (Parallel engine). The search runs inside a dedicated chat.completions
 * request against the VEGA or OpenRouter credential, so the result returns as the message content
 * plus `url_citation` annotations — no browser, no extra API key.
 */

import { Type } from "typebox";
import type { ExtensionToolContext, ToolDefinition } from "../../core/extensions/types.ts";

export const WEB_SEARCH_TOOL_NAME = "web_search";

const SEARCH_PROVIDERS = [
	{ provider: "vega", baseUrl: "https://api.vega.chat/api/v1" },
	{ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
] as const;
const SEARCH_TIMEOUT_MS = 60_000;
const DEFAULT_SEARCH_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_MAX_RESULTS = 5;

export const webSearchSchema = Type.Object({
	query: Type.String({ description: "The search query, in natural language." }),
	max_results: Type.Optional(
		Type.Number({ description: `Results to return, 1-25. Defaults to ${DEFAULT_MAX_RESULTS}.` }),
	),
});

export interface WebSearchDetails {
	provider: string;
	model: string;
	citations: Array<{ url: string; title: string }>;
}

interface SearchProvider {
	name: string;
	baseUrl: string;
	apiKey: string;
}

interface UrlCitation {
	url: string;
	title: string;
}

interface ServerToolMessage {
	content?: string | Array<{ type?: string; text?: string }> | null;
	annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string } }> | null;
}

function messageText(content: ServerToolMessage["content"]): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (part && typeof part.text === "string" ? part.text : ""))
			.join("\n")
			.trim();
	}
	return "";
}

function messageCitations(annotations: ServerToolMessage["annotations"]): UrlCitation[] {
	return (annotations ?? [])
		.filter((entry) => entry?.type === "url_citation" && typeof entry.url_citation?.url === "string")
		.map((entry) => ({
			url: entry.url_citation?.url ?? "",
			title: entry.url_citation?.title ?? entry.url_citation?.url ?? "",
		}));
}

/** First provider with a working credential wins: VEGA, then OpenRouter. */
async function resolveSearchProvider(ctx: ExtensionToolContext): Promise<SearchProvider | undefined> {
	for (const { provider, baseUrl } of SEARCH_PROVIDERS) {
		const apiKey = await ctx.modelRegistry.getApiKeyForProvider(provider);
		if (apiKey) return { name: provider, baseUrl, apiKey };
	}
	return undefined;
}

export function createWebSearchToolDefinition(): ToolDefinition<typeof webSearchSchema, WebSearchDetails> {
	return {
		name: WEB_SEARCH_TOOL_NAME,
		label: WEB_SEARCH_TOOL_NAME,
		description:
			"Search the web for current information and return an answer with source links. Use it for fresh facts, documentation, and research; use web_fetch to read a specific URL. Runs on the VEGA or OpenRouter credential.",
		promptSnippet: "Search the web for current information",
		parameters: webSearchSchema,
		annotations: { readOnlyHint: true, openWorldHint: true },
		executionMode: "parallel",
		async execute(_toolCallId, { query, max_results }, signal, _onUpdate, ctx) {
			if (query.trim() === "") throw new Error("query must not be empty");
			const provider = await resolveSearchProvider(ctx);
			if (!provider) {
				throw new Error(
					"web_search needs a VEGA or OpenRouter credential: sign in to VEGA with /login, set VEGA_API_KEY, or configure OpenRouter",
				);
			}
			const maxResults = max_results ?? DEFAULT_MAX_RESULTS;
			if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 25) {
				throw new Error("max_results must be an integer between 1 and 25");
			}
			const model = process.env.PI_WEB_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL;
			const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
			const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
			const response = await fetch(`${provider.baseUrl}/chat/completions`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: query }],
					tools: [
						{
							type: "openrouter:web_search",
							parameters: { engine: "parallel", mode: "basic", max_results: maxResults },
						},
					],
					stream: false,
				}),
				signal: fetchSignal,
			});
			if (!response.ok) {
				const detail = (await response.text()).slice(0, 500);
				throw new Error(`Search failed on ${provider.name}: HTTP ${response.status} ${detail}`.trim());
			}
			const data = (await response.json()) as { choices?: Array<{ message?: ServerToolMessage }> };
			const message = data.choices?.[0]?.message;
			const text = messageText(message?.content).trim();
			const citations = messageCitations(message?.annotations);
			const sources = citations.map((citation) => `- [${citation.title}](${citation.url})`).join("\n");
			const body = [text || "(no answer)", sources && `\nSources:\n${sources}`].filter(Boolean).join("\n");
			return {
				content: [{ type: "text", text: body }],
				details: { provider: provider.name, model, citations },
			};
		},
	};
}
