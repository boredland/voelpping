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
			"'Green sauce' here is Frankfurter Grüne Sauce: cold chunky pale mint-green sour-cream sauce with coarsely-blended boiled-egg pieces and heavy chopped fresh herbs (parsley, chervil, chives, sorrel, cress) — visible texture, NOT smooth, NOT puree. Served as a pool or small bowl BESIDE halved hard-boiled eggs and halved boiled yellow potatoes; eggs and potatoes plain and undressed, sauce stays in its own pool, never drizzled on top.",
	},
	{
		match: /kartoffelsalat|potato salad/i,
		visual:
			"German potato salad: cold thin 3mm coin-slices of waxy potato (NOT cubes), in a light broth-vinegar or creamy mayo-mustard dressing, chives and small diced pickles visible.",
	},
	{
		match: /fleischwurst|lyoner|meat sausage/i,
		visual:
			"'Fleischwurst' is the German equivalent of American bologna: soft finely-ground emulsified pork sausage, smooth uniform pale-pink interior (no grain, no visible chunks), shaped as a peeled cylindrical ring or thick flat 1cm slices. NOT bratwurst, NOT salami, NOT a hot dog, NOT grilled.",
	},
];

const PROMPT_LIMIT = 2048;

function buildPrompt(itemEn: string): string {
	const dish = stripPrices(itemEn);
	const hints = DISH_HINTS.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	const prompt = `STRICT: render ONLY the food items explicitly named below — no invented sides, no garnishes, no lemon, no herb sprigs, no onion, no bread, no pickles, no lettuce. Empty tray space is fine.

Overhead phone snapshot of a takeaway lunch from a small German neighborhood butcher (Metzgerei): ${dish}.${extra} Served in a plain open white styrofoam Imbissschale (shallow rectangular EPS clamshell base, no lid visible), on a cheap wooden counter. Nothing else in frame: no cutlery (no fork/spoon/knife), no lid, no napkin, no side containers, no drinks, no decorative garnish. Flat greenish shop fluorescent or cheap phone flash — harsh direct light, flat shadows, slight highlight blow. Handheld mid-range smartphone: soft focus, faint motion blur, visible sensor noise, compressed JPEG look, centered subject, slight tilt. Amateur snapshot, NOT food photography, NOT restaurant plating, NO shallow depth of field, NO styling, NO magazine polish. No text, no logos.`;
	if (prompt.length > PROMPT_LIMIT) {
		console.warn(
			`Prompt ${prompt.length} chars exceeds ${PROMPT_LIMIT}; truncating`,
		);
		return prompt.slice(0, PROMPT_LIMIT);
	}
	return prompt;
}

export async function generateMealImage(
	ai: Ai,
	itemEn: string,
): Promise<Uint8Array> {
	if (!itemEn.trim()) {
		throw new Error("generateMealImage: empty item");
	}

	const prompt = buildPrompt(itemEn);
	console.log(
		`flux prompt (${prompt.length} chars) for item "${itemEn.slice(0, 60)}"`,
	);
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
