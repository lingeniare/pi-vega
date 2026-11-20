import { describe, expect, it } from "vitest";
import { getPionUserAgent } from "../src/utils/pion-user-agent.ts";

describe("getPionUserAgent", () => {
	it("formats the user agent expected by pi.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getPionUserAgent("1.2.3");

		expect(userAgent).toBe(`pion/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^pion\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
