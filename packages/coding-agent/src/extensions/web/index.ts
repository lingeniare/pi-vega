/**
 * The web tools as an extension: `web_fetch` reads a URL as readable text, `web_search` searches
 * the web through the OpenRouter-compatible `openrouter:web_search` server tool on the VEGA or
 * OpenRouter credential. The CLI loads it as a built-in extension; SDK users add
 * `createWebExtension()` to their extension factories.
 *
 * Both tools are registered inactive. Activate them with `--tools`, the `defaultTools` setting
 * (`["+web_fetch", "+web_search"]`), or `setActiveTools()`.
 */

import type { ExtensionFactory } from "../../core/extensions/types.ts";
import { createWebFetchToolDefinition } from "./web-fetch.ts";
import { createWebSearchToolDefinition } from "./web-search.ts";

export function createWebExtension(): ExtensionFactory {
	return (pi) => {
		pi.registerTool({ ...createWebFetchToolDefinition(), defaultActive: false });
		pi.registerTool({ ...createWebSearchToolDefinition(), defaultActive: false });
	};
}

export default createWebExtension();
