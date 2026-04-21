const MODEL = "@cf/black-forest-labs/flux-1-schnell";

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// Dish-specific hints appended to the prompt when a meal mentions a regional
// specialty that a generic food model would render incorrectly.
const DISH_HINTS: { match: RegExp; hint: string }[] = [
	{
		match: /gr[üu]ne sauce|green sauce/i,
		hint: 'Note: "Grüne Sauce" here refers to the Hessian specialty "Frankfurter Grüne Sauce" — a cold, creamy, bright green herb sauce made from seven fresh herbs (parsley, chives, chervil, borage, sorrel, salad burnet, cress), typically served with boiled potatoes and halved hard-boiled eggs.',
	},
];

function buildPrompt(itemsEn: string[]): string {
	const dish = itemsEn.join(", ");
	const joined = itemsEn.join(" | ");
	const hints = DISH_HINTS.filter((h) => h.match.test(joined))
		.map((h) => h.hint)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	return `Casual overhead smartphone snapshot of a daily lunch special from a small German neighborhood butcher shop (Metzgerei), packed for takeaway: ${dish}.${extra} Served in a disposable takeaway container — a paper tray, compostable kraft bowl, or clear plastic Imbiss container with a clip-on lid — placed on a plain shop counter or simple wooden surface. Honest portion sizes, home-style plating, nothing fancy. Lit with the flat mixed fluorescent and daylight of a small shop interior. Shot on a mid-range smartphone: slightly compressed dynamic range, modest depth of field, subtle sensor noise, everything roughly in focus, amateur framing. Not professional food photography, not a restaurant plate, not glossy magazine styling. No text, no logos, no watermarks.`;
}

export async function generateMealImage(
	ai: Ai,
	itemsEn: string[],
): Promise<Uint8Array> {
	if (itemsEn.length === 0) {
		throw new Error("generateMealImage: empty items");
	}

	const prompt = buildPrompt(itemsEn);
	const response = (await ai.run(MODEL, {
		prompt,
		steps: 4,
	} as Record<string, unknown>)) as { image?: string } | ReadableStream;

	if (response instanceof ReadableStream) {
		const reader = response.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const total = chunks.reduce((n, c) => n + c.length, 0);
		const bytes = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			bytes.set(c, offset);
			offset += c.length;
		}
		return bytes;
	}

	if (!response.image) {
		throw new Error("flux-schnell returned no image");
	}
	return base64ToBytes(response.image);
}
