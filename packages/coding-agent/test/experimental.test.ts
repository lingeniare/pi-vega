import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalPiExperimental = process.env.PION_EXPERIMENTAL;

	afterEach(() => {
		if (originalPiExperimental === undefined) {
			delete process.env.PION_EXPERIMENTAL;
		} else {
			process.env.PION_EXPERIMENTAL = originalPiExperimental;
		}
	});

	it("returns false when PION_EXPERIMENTAL is unset", () => {
		delete process.env.PION_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when PION_EXPERIMENTAL is empty", () => {
		process.env.PION_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when PION_EXPERIMENTAL is set to 1", () => {
		process.env.PION_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when PION_EXPERIMENTAL is set to 0", () => {
		process.env.PION_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when PION_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.PION_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});
