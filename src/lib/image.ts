const MODEL = "@cf/leonardo/phoenix-1.0";

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

const NEGATIVE_PROMPT =
	"lemon, lemon wedge, lemon slice, citrus, parsley sprig, rosemary sprig, herb garnish, decorative herbs, microgreens, edible flowers, garnish, fork, spoon, knife, chopsticks, cutlery, utensils, plate, bowl on the side, container lid, plastic lid, clamshell lid closed, napkin, tissue, paper towel, side container, side dish, bread, bread roll, butter, drink, cup, glass, bottle, can, straw, text, words, letters, numbers, logo, watermark, brand, label, fine dining, restaurant plating, white tablecloth, marble counter, shallow depth of field, strong bokeh, studio lighting, softbox, backlit, rim light, artistic composition, flat lay styling, food magazine, cookbook, ramekins of sauce, dipping sauce cup";

function buildPositive(itemEn: string): string {
	const dish = stripPrices(itemEn);
	const hints = DISH_HINTS.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	const prompt = `Overhead phone snapshot of a takeaway lunch from a small German neighborhood butcher (Metzgerei): ${dish}.${extra} Served in a plain open white styrofoam Imbissschale (shallow rectangular EPS foam clamshell tray, base only, lid flipped open behind it or not visible), on a cheap wooden counter. Only the food items named above are in the tray — nothing else. Flat slightly greenish shop fluorescent or a cheap phone flash: harsh direct light, flat shadows, slight highlight blow on wet surfaces. Handheld mid-range smartphone, portrait crop: soft focus, faint motion blur, visible sensor noise, compressed JPEG look, centered subject, slight tilt. Amateur snapshot aesthetic.`;
	if (prompt.length > PROMPT_LIMIT) {
		console.warn(
			`Positive prompt ${prompt.length} chars exceeds ${PROMPT_LIMIT}; truncating`,
		);
		return prompt.slice(0, PROMPT_LIMIT);
	}
	return prompt;
}

async function readStream(stream: ReadableStream): Promise<Uint8Array> {
	const reader = stream.getReader();
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

export async function generateMealImage(
	ai: Ai,
	itemEn: string,
): Promise<Uint8Array> {
	if (!itemEn.trim()) {
		throw new Error("generateMealImage: empty item");
	}

	const prompt = buildPositive(itemEn);
	console.log(
		`image prompt (${prompt.length} chars, -${NEGATIVE_PROMPT.length}) for item "${itemEn.slice(0, 60)}"`,
	);
	const response = (await ai.run(MODEL, {
		prompt,
		negative_prompt: NEGATIVE_PROMPT,
		num_steps: 20,
		guidance: 7.5,
		height: 1024,
		width: 1024,
	} as Record<string, unknown>)) as
		| { image?: string }
		| ReadableStream
		| Uint8Array
		| ArrayBuffer;

	if (response instanceof ReadableStream) return readStream(response);
	if (response instanceof ArrayBuffer) return new Uint8Array(response);
	if (response instanceof Uint8Array) return response;
	if (
		response &&
		typeof response === "object" &&
		"image" in response &&
		response.image
	) {
		return base64ToBytes(response.image);
	}
	throw new Error(`${MODEL} returned unexpected response shape`);
}
