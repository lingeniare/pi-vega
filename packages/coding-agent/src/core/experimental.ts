export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.PION_EXPERIMENTAL === "1";
}
