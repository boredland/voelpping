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
			"The 'green sauce' is Frankfurter Grüne Sauce, a traditional Hessian cold herb sauce: a sour-cream base with coarsely chopped boiled eggs blended in, salt and spices, and a heavy amount of fresh herbs (parsley, chervil, chives, sorrel, cress, borage, salad burnet) pulsed in a blender but NOT to a smooth puree — the finished sauce is chunky and textured, pale mint-to-sage green, with visible small pieces of egg white and bright flecks of chopped herb suspended in creamy sour cream. Served as a pool or small bowl of sauce with halved hard-boiled eggs and halved boiled waxy yellow potatoes arranged next to it on the side — eggs and potatoes are plain and undressed, the sauce stays in its own pool, it is NOT drizzled over the eggs or potatoes.",
	},
	{
		match: /kartoffelsalat|potato salad/i,
		visual:
			"The potato salad is German-style: cold, thinly sliced waxy potatoes (thin uniform coin slices about 3mm, NOT cubes) glistening in either a light broth-and-vinegar dressing (southern/Hessian) or a creamy mayonnaise-and-mustard dressing (northern), with finely chopped chives or parsley and small diced pickles visible.",
	},
];

function buildPrompt(itemEn: string): string {
	const dish = stripPrices(itemEn);
	const hints = DISH_HINTS.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	return `Quick overhead phone snapshot of a daily lunch special from a small German neighborhood butcher shop (Metzgerei), packed for takeaway: ${dish}.${extra} Served in a plain open disposable takeaway container — paper tray or kraft-paper bowl — placed on a plain shop counter or cheap wooden table. Honest portion sizes, home-style plating, nothing fancy. Nothing else in the frame: NO cutlery of any kind (no fork, no spoon, no knife, no chopsticks), NO container lid, NO napkin, NO side containers, NO packaging, NO drinks, NO garnish-placement — only the food in its one container. Lit by the flat slightly greenish overhead fluorescent of a small shop interior or by a cheap phone flash: harsh direct light, flat shadows, slightly blown highlights on wet surfaces. Shot handheld on a cheap mid-range smartphone: soft focus, faint motion blur, visible sensor noise, compressed JPEG look, everything roughly in focus but nothing crisp, centered subject with no compositional care, slight camera tilt. Amateur snapshot aesthetic. NOT food photography, NOT restaurant plating, NO shallow depth of field, NO color grading, NO styling, NO magazine polish. No text, no logos, no watermarks.`;
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
