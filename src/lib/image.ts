const MODEL = "@cf/black-forest-labs/flux-1-schnell";

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// OCR-preserved prices like "11,90 €", "€ 11.90", "11,90EUR" end up in the
// translated meal text and derail the image model. Strip them.
function stripPrices(text: string): string {
	return text
		.replace(/[€$£]\s*\d+[.,]\d{1,2}/g, "")
		.replace(/\d+[.,]\d{1,2}\s*(€|eur|euro)\b/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

// For dishes where the literal translated name misleads the image model, we
// substitute / append a concrete visual description keyed to the visual
// appearance of the actual dish, not an explanatory note. Flux-schnell ignores
// meta-commentary like "Note: X refers to Y" — it responds to direct visual
// language.
const DISH_HINTS: { match: RegExp; visual: string }[] = [
	{
		match: /gr[üu]ne sauce|green sauce/i,
		visual:
			"The sauce labeled 'green sauce' is Frankfurter Grüne Sauce: a pale mint-green creamy yogurt-and-quark-based cold herb dressing, pourable and glossy, with visible tiny flecks of finely chopped parsley, chervil, chives, sorrel and cress. Not a thick puree, not pesto. Served drizzled around or over quartered hard-boiled eggs and halved boiled waxy potatoes sitting on the plate — sauce pools gently, does not coat everything.",
	},
	{
		match: /kartoffelsalat|potato salad/i,
		visual:
			"The potato salad is German-style: cold, thinly sliced waxy potatoes glistening in either a light broth-and-vinegar dressing (southern/Hessian) or a creamy mayonnaise-and-mustard dressing (northern), with finely chopped chives or parsley and small diced pickles visible. Slices are thin and uniform, not chunky American cubes.",
	},
];

function buildPrompt(itemEn: string): string {
	const dish = stripPrices(itemEn);
	const hints = DISH_HINTS.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	return `Casual overhead smartphone snapshot of a daily lunch special from a small German neighborhood butcher shop (Metzgerei), packed for takeaway: ${dish}.${extra} Served in a disposable takeaway container — a paper tray, compostable kraft bowl, or clear plastic Imbiss container with a clip-on lid — placed on a plain shop counter or simple wooden surface. Honest portion sizes, home-style plating, nothing fancy. Lit with the flat mixed fluorescent and daylight of a small shop interior. Shot on a mid-range smartphone: slightly compressed dynamic range, modest depth of field, subtle sensor noise, everything roughly in focus, amateur framing. Not professional food photography, not a restaurant plate, not glossy magazine styling. No text, no logos, no watermarks.`;
}

export async function generateMealImage(
	ai: Ai,
	itemEn: string,
): Promise<Uint8Array> {
	if (!itemEn.trim()) {
		throw new Error("generateMealImage: empty item");
	}

	const prompt = buildPrompt(itemEn);
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
