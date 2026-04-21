const MODEL = "@cf/black-forest-labs/flux-1-schnell";

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function stripPrices(text: string): string {
	return text
		.replace(/[€$£]\s*\d+[.,]\d{1,2}/g, "")
		.replace(/\d+[.,]\d{1,2}\s*(€|eur|euro)\b/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

const DISH_HINTS_DE: { match: RegExp; visual: string }[] = [
	{
		match: /gr[üu]ne (sauce|soße)/i,
		visual:
			"'Grüne Sauce' ist Frankfurter Grüne Sauce: kalte, stückige, blassgrüne Kräutersauce aus Sauerrahm mit grob zerkleinerten Eierstücken und gehackten Kräutern. Sichtbare Textur, NICHT glatt. Daneben halbierte hartgekochte Eier und halbierte Pellkartoffeln — Sauce bleibt als eigener Pool, NICHT über die Eier gegossen.",
	},
	{
		match: /kartoffelsalat/i,
		visual:
			"Deutscher Kartoffelsalat: kalte, dünne 3mm-Scheiben festkochender Kartoffeln (KEINE Würfel), in Brühe-Essig- oder Mayo-Senf-Dressing, mit Schnittlauch und kleinen Gewürzgurkenstückchen.",
	},
	{
		match: /fleischwurst|lyoner/i,
		visual:
			"Fleischwurst ist das deutsche Äquivalent zu amerikanischer Bologna: weiche, fein emulgierte Brühwurst, gleichmäßig blassrosa Schnittfläche ohne sichtbares Korn, als dicker Ring oder dicke Scheiben. KEINE Bratwurst, KEIN Grillwürstchen.",
	},
];

const PROMPT_LIMIT = 2048;

function buildPrompt(itemDe: string): string {
	const dish = stripPrices(itemDe);
	const hints = DISH_HINTS_DE.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	const prompt = `STRIKT: NUR die genannten Speisen darstellen — keine erfundenen Beilagen, keine Deko, keine Zitrone, keine Kräuter, keine Zwiebeln, kein Brot, keine Gurken, kein Salat. Leerer Platz in der Schale ist OK.

Handyfoto von oben: Mittagstisch aus einer kleinen deutschen Metzgerei, zum Mitnehmen: ${dish}.${extra} In einer weißen Styropor-Imbissschale auf einer Holztheke. Nichts sonst im Bild: kein Besteck, kein Deckel, keine Serviette, keine Nebencontainer, keine Getränke. Flaches grünliches Neonlicht oder billiger Handyblitz. Aufgenommen mit einem günstigen Smartphone: weicher Fokus, leichtes Bildrauschen, JPEG-Look, zentriertes Motiv, leichte Schräglage. Amateurschnappschuss. Kein Text, keine Logos.`;
	if (prompt.length > PROMPT_LIMIT) {
		console.warn(
			`Prompt ${prompt.length} chars exceeds ${PROMPT_LIMIT}; truncating`,
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
	itemDe: string,
): Promise<Uint8Array> {
	if (!itemDe.trim()) {
		throw new Error("generateMealImage: empty item");
	}

	const prompt = buildPrompt(itemDe);
	console.log(
		`flux prompt (${prompt.length} chars) for item "${itemDe.slice(0, 60)}"`,
	);
	const response = (await ai.run(MODEL, {
		prompt,
		steps: 4,
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
		return base64ToBytes(response.image as string);
	}
	throw new Error(`${MODEL} returned unexpected response shape`);
}
