import { describe, expect, it } from "vitest";
import { compareProviders, isPreferredProvider, PREFERRED_PROVIDER_IDS } from "../src/core/preferred-providers.ts";

describe("compareProviders", () => {
	it("orders preferred partners first, in their order, then the rest by name", () => {
		const providers = [
			{ id: "zai", name: "Z.AI" },
			{ id: "openrouter", name: "OpenRouter" },
			{ id: "anthropic", name: "Anthropic" },
			{ id: "radius", name: "Radius" },
			{ id: "vega", name: "VEGA" },
			{ id: "google", name: "Google" },
		];

		expect(PREFERRED_PROVIDER_IDS).toEqual(["vega", "radius", "openrouter"]);
		expect(providers.sort(compareProviders).map((provider) => provider.id)).toEqual([
			"vega",
			"radius",
			"openrouter",
			"anthropic",
			"google",
			"zai",
		]);
	});
});

describe("isPreferredProvider", () => {
	it("recognizes only the preferred partners", () => {
		expect(isPreferredProvider("vega")).toBe(true);
		expect(isPreferredProvider("radius")).toBe(true);
		expect(isPreferredProvider("openrouter")).toBe(true);
		expect(isPreferredProvider("anthropic")).toBe(false);
	});
});
