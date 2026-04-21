const MODEL = "google/nano-banana-pro";

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
			"Frankfurter Grüne Sauce: kalte, stückige, blassgrüne Kräutersauce aus Sauerrahm mit grob zerkleinerten Eierstücken und gehackten Kräutern (Petersilie, Kerbel, Schnittlauch, Sauerampfer, Kresse). Sichtbare Textur, NICHT glatt. Daneben halbierte hartgekochte Eier und halbierte Pellkartoffeln — Sauce bleibt als eigener Pool, NICHT über die Eier gegossen.",
	},
	{
		match: /kartoffelsalat/i,
		visual:
			"Deutscher Kartoffelsalat: kalte, dünne 3mm-Scheiben festkochender Kartoffeln (KEINE Würfel), in Brühe-Essig- oder Mayo-Senf-Dressing, mit Schnittlauch und kleinen Gewürzgurkenstückchen.",
	},
	{
		match: /fleischwurst|lyoner/i,
		visual:
			"Fleischwurst: weiche, fein emulgierte Brühwurst, gleichmäßig blassrosa Schnittfläche ohne sichtbares Korn, als dicker Ring oder dicke Scheiben. KEINE Bratwurst, KEIN Grillwürstchen.",
	},
];

function buildPrompt(itemDe: string): string {
	const dish = stripPrices(itemDe);
	const hints = DISH_HINTS_DE.filter((h) => h.match.test(dish))
		.map((h) => h.visual)
		.join(" ");
	const extra = hints ? ` ${hints}` : "";
	return `Handyfoto von oben: Mittagstisch-Gericht aus einer kleinen deutschen Metzgerei, zum Mitnehmen: ${dish}.${extra} In einer weißen Styropor-Imbissschale auf einer einfachen Holztheke. Nur die genannten Speisen in der Schale — keine Extras, keine Deko, keine Zitrone, keine Petersilie, kein Besteck, kein Deckel. Flaches Neonlicht, Handykamera-Ästhetik.`;
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

function dataUriToBytes(uri: string): Uint8Array {
	const match = uri.match(/^data:[^;]+;base64,(.+)$/);
	if (match) return base64ToBytes(match[1]);
	throw new Error("Unexpected image URI format");
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
		`image prompt (${prompt.length} chars) for item "${itemDe.slice(0, 60)}"`,
	);
	const response = (await ai.run(MODEL, {
		prompt,
		aspect_ratio: "1:1",
		output_format: "jpg",
		image_size: "1K",
	} as Record<string, unknown>)) as
		| { image?: string }
		| ReadableStream
		| Uint8Array
		| ArrayBuffer
		| string;

	if (typeof response === "string") return dataUriToBytes(response);
	if (response instanceof ReadableStream) return readStream(response);
	if (response instanceof ArrayBuffer) return new Uint8Array(response);
	if (response instanceof Uint8Array) return response;
	if (
		response &&
		typeof response === "object" &&
		"image" in response &&
		typeof response.image === "string"
	) {
		if (response.image.startsWith("data:"))
			return dataUriToBytes(response.image);
		return base64ToBytes(response.image);
	}
	throw new Error(`${MODEL} returned unexpected response shape`);
}
