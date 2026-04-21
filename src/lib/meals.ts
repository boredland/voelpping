export function parseMealItems(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		// legacy plain string
	}
	return [value];
}

// `{day}_image` columns may hold a JSON array of URLs (one per meal option)
// or — from the first rollout — a single raw URL string.
export function parseImageUrls(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed))
			return parsed.filter((v): v is string => typeof v === "string");
	} catch {
		// legacy single-URL value
	}
	return [value];
}
