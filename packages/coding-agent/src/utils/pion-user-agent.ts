import { formatUserAgent } from "@earendil-works/pi-ai";

/** pion`s `User-Agent` for its own network requests; the same detailed form pi-ai sends to providers. */
export function getPionUserAgent(version: string): string {
	return formatUserAgent({ userAgent: "detailed", version });
}
