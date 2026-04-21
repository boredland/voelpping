const GATEWAY_BASE =
	"https://gateway.ai.cloudflare.com/v1/cd1e88db5a44de0f45317275cbcef879/default/google-ai-studio";
const MODEL = "gemini-2.5-flash-image";

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

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

interface GeminiResponse {
	candidates?: {
		content?: {
			parts?: { inline_data?: { mime_type?: string; data?: string } }[];
		};
	}[];
	error?: { message?: string; code?: number };
}

export async function generateMealImage(
	googleApiKey: string,
	gatewayToken: string,
	itemDe: string,
): Promise<Uint8Array> {
	if (!itemDe.trim()) {
		throw new Error("generateMealImage: empty item");
	}

	const prompt = buildPrompt(itemDe);
	console.log(
		`gemini prompt (${prompt.length} chars) for item "${itemDe.slice(0, 60)}"`,
	);

	const url = `${GATEWAY_BASE}/v1beta/models/${MODEL}:generateContent`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-goog-api-key": googleApiKey,
			"cf-aig-authorization": `Bearer ${gatewayToken}`,
		},
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: {
				responseModalities: ["IMAGE"],
				imageConfig: { aspectRatio: "1:1" },
			},
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as GeminiResponse;
	if (data.error) {
		throw new Error(`Gemini error: ${data.error.message}`);
	}

	const parts = data.candidates?.[0]?.content?.parts ?? [];
	const imagePart = parts.find((p) => p.inline_data?.data);
	if (!imagePart?.inline_data?.data) {
		throw new Error(
			`Gemini returned no image: ${JSON.stringify(data).slice(0, 300)}`,
		);
	}

	return base64ToBytes(imagePart.inline_data.data);
}
