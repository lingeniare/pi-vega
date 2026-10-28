import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionToolContext } from "../src/core/extensions/types.ts";
import { htmlToText } from "../src/extensions/web/html-to-text.ts";
import { createWebFetchToolDefinition } from "../src/extensions/web/web-fetch.ts";
import { createWebSearchToolDefinition } from "../src/extensions/web/web-search.ts";

function ctxWithKeys(keys: Record<string, string>): ExtensionToolContext {
	return {
		modelRegistry: {
			getApiKeyForProvider: async (provider: string) => keys[provider],
		},
	} as unknown as ExtensionToolContext;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	vi.stubGlobal("fetch", vi.fn(handler));
}

function textResponse(body: string, init: { status?: number; statusText?: string; contentType?: string } = {}) {
	return new Response(body, {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: init.contentType ? { "content-type": init.contentType } : {},
	});
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n");
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("htmlToText", () => {
	it("keeps the title, headings, lists, and links, and drops non-content blocks", () => {
		const html = `<!doctype html><html><head><title>Doc &amp; Guide</title><style>body{color:red}</style></head>
<body><script>alert(1)</script><h1>Intro</h1><p>Hello <a href="https://a.dev/x">link</a> &lt;world&gt;</p>
<ul><li>one</li><li>two</li></ul><p>tail&nbsp;end</p></body></html>`;
		const text = htmlToText(html);
		expect(text).toContain("# Doc & Guide");
		expect(text).toContain("# Intro");
		expect(text).toContain("Hello [link](https://a.dev/x) <world>");
		expect(text).toContain("- one");
		expect(text).toContain("- two");
		expect(text).not.toContain("alert");
		expect(text).not.toContain("color:red");
		expect(text).toContain("tail end");
	});
});

describe("web_fetch", () => {
	const tool = createWebFetchToolDefinition();
	const ctx = ctxWithKeys({});

	it("converts an HTML page to readable text", async () => {
		mockFetch(() =>
			textResponse("<html><head><title>T</title></head><body><p>Page body</p></body></html>", {
				contentType: "text/html; charset=utf-8",
			}),
		);
		const result = await tool.execute("t1", { url: "https://example.com/" }, undefined, undefined, ctx);
		expect(resultText(result)).toContain("# T");
		expect(resultText(result)).toContain("Page body");
		expect(result.details?.finalUrl).toBe("https://example.com/");
	});

	it("returns plain text and JSON as-is", async () => {
		mockFetch(() => textResponse('{"a":1}', { contentType: "application/json" }));
		const result = await tool.execute("t1", { url: "https://api.example.com/x" }, undefined, undefined, ctx);
		expect(resultText(result)).toBe('{"a":1}');
	});

	it("rejects non-http URLs and binary content", async () => {
		await expect(tool.execute("t1", { url: "file:///etc/passwd" }, undefined, undefined, ctx)).rejects.toThrow(
			"http/https only",
		);
		mockFetch(() => textResponse("%PDF-1.7", { contentType: "application/pdf" }));
		await expect(
			tool.execute("t1", { url: "https://example.com/doc.pdf" }, undefined, undefined, ctx),
		).rejects.toThrow("Unsupported content type");
	});

	it("surfaces HTTP errors", async () => {
		mockFetch(() => textResponse("nope", { status: 404, statusText: "Not Found" }));
		await expect(
			tool.execute("t1", { url: "https://example.com/missing" }, undefined, undefined, ctx),
		).rejects.toThrow("HTTP 404 Not Found");
	});
});

describe("web_search", () => {
	const tool = createWebSearchToolDefinition();

	it("prefers the VEGA credential and sends the server tool", async () => {
		let captured: { url: string; init?: RequestInit } | undefined;
		mockFetch(async (url, init) => {
			captured = { url, init };
			return textResponse(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "Paris is the capital of France.",
								annotations: [
									{
										type: "url_citation",
										url_citation: { url: "https://fr.wikipedia.org/wiki/Paris", title: "Paris" },
									},
									{ type: "other", url_citation: { url: "https://skip.dev", title: "skip" } },
								],
							},
						},
					],
				}),
				{ contentType: "application/json" },
			);
		});
		const ctx = ctxWithKeys({ vega: "sk-apivega-test", openrouter: "sk-or-test" });
		const result = await tool.execute("t1", { query: "capital of France" }, undefined, undefined, ctx);

		expect(captured?.url).toBe("https://api.vega.chat/api/v1/chat/completions");
		const headers = new Headers(captured?.init?.headers);
		expect(headers.get("authorization")).toBe("Bearer sk-apivega-test");
		const body = JSON.parse(String(captured?.init?.body));
		expect(body.tools).toEqual([
			{ type: "openrouter:web_search", parameters: { engine: "parallel", mode: "basic", max_results: 5 } },
		]);
		expect(body.stream).toBe(false);

		expect(resultText(result)).toContain("Paris is the capital of France.");
		expect(resultText(result)).toContain("Sources:");
		expect(resultText(result)).toContain("[Paris](https://fr.wikipedia.org/wiki/Paris)");
		expect(resultText(result)).not.toContain("skip.dev");
		expect(result.details?.provider).toBe("vega");
	});

	it("falls back to the OpenRouter credential", async () => {
		let captured: { url: string; init?: RequestInit } | undefined;
		mockFetch(async (url, init) => {
			captured = { url, init };
			return textResponse(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				contentType: "application/json",
			});
		});
		const ctx = ctxWithKeys({ openrouter: "sk-or-test" });
		const result = await tool.execute("t1", { query: "q", max_results: 3 }, undefined, undefined, ctx);
		expect(captured?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
		const body = JSON.parse(String(captured?.init?.body));
		expect(body.tools[0].parameters.max_results).toBe(3);
		expect(result.details?.provider).toBe("openrouter");
	});

	it("reports a missing credential and API errors", async () => {
		await expect(tool.execute("t1", { query: "q" }, undefined, undefined, ctxWithKeys({}))).rejects.toThrow(
			"VEGA or OpenRouter credential",
		);

		mockFetch(() => textResponse('{"error":{"message":"bad tools"}}', { status: 400, statusText: "Bad Request" }));
		const ctx = ctxWithKeys({ vega: "sk-apivega-test" });
		await expect(tool.execute("t1", { query: "q" }, undefined, undefined, ctx)).rejects.toThrow("HTTP 400");
	});
});
