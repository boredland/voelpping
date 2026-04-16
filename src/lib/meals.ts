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
