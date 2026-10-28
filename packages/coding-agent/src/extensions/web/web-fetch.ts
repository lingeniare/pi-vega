/**
 * The `web_fetch` tool: read a web page as readable text. Fetches with a plain GET, converts HTML
 * to text, and truncates to the shared tool output limit. Local and free; no API key.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "../../core/tools/truncate.ts";
import { htmlToText } from "./html-to-text.ts";

export const WEB_FETCH_TOOL_NAME = "web_fetch";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 1024 * 1024;
const USER_AGENT = "pi-web-fetch/1.0 (+https://pi.dev)";

export const webFetchSchema = Type.Object({
	url: Type.String({ description: "The http(s) URL to fetch and read." }),
});

export interface WebFetchDetails {
	url: string;
	finalUrl: string;
	contentType: string;
	truncated: boolean;
}

function httpUrl(input: string): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(input.trim());
	} catch {
		return undefined;
	}
	return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
}

/** Read at most `maxBytes` of the body as UTF-8 text, then cancel the stream. */
async function readBodyText(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return response.text();
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let received = 0;
	let text = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			text += decoder.decode(value, { stream: true });
			if (received >= maxBytes) break;
		}
	} finally {
		reader.cancel().catch(() => undefined);
	}
	return text + decoder.decode();
}

export function createWebFetchToolDefinition(): ToolDefinition<typeof webFetchSchema, WebFetchDetails> {
	return {
		name: WEB_FETCH_TOOL_NAME,
		label: WEB_FETCH_TOOL_NAME,
		description:
			"Fetch a web page and return its readable text (HTML converted to markdown-like text, JSON and plain text as-is). Use it to read URLs the user shares or pages found by web_search. Large pages are truncated; pages rendered by JavaScript may be incomplete.",
		promptSnippet: "Fetch a web page and read its text",
		parameters: webFetchSchema,
		annotations: { readOnlyHint: true, openWorldHint: true },
		executionMode: "parallel",
		async execute(_toolCallId, { url }, signal) {
			const target = httpUrl(url);
			if (!target) throw new Error(`Invalid or unsupported URL (http/https only): ${url}`);
			const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
			const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
			const response = await fetch(target, {
				headers: {
					"user-agent": USER_AGENT,
					accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
				},
				redirect: "follow",
				signal: fetchSignal,
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText} for ${target}`);
			}
			const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
			const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml";
			const isText =
				isHtml ||
				contentType.startsWith("text/") ||
				contentType.endsWith("+json") ||
				contentType === "application/json";
			if (contentType && !isText) {
				throw new Error(`Unsupported content type "${contentType}" for ${target}; web_fetch reads text pages only`);
			}
			const body = await readBodyText(response, MAX_DOWNLOAD_BYTES);
			const text = isHtml ? htmlToText(body) : body;
			const result = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES });
			const note = result.truncated ? `\n\n[truncated: page is ${formatSize(result.totalBytes)}]` : "";
			return {
				content: [{ type: "text", text: `${result.content.trim() || "(empty page)"}${note}` }],
				details: { url, finalUrl: response.url || target, contentType, truncated: result.truncated },
			};
		},
	};
}
