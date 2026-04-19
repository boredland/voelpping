export interface MenuData {
	tuesday: string | null;
	wednesday: string | null;
	thursday: string | null;
	friday: string | null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

const PROMPT = `You are looking at an image from a German butcher shop's Facebook page.
First, decide whether this image is a weekly lunch menu ("Mittagstisch" or "Mittags-Lunch") listing meals for Tuesday through Friday. A lunch menu will show day names (Dienstag, Mittwoch, Donnerstag, Freitag), meal descriptions, and usually prices.

If it is NOT a lunch menu (e.g., it's a product photo, event flyer, greeting, or other promotional graphic), return ONLY:
{"isMenu": false}

If it IS a lunch menu, return ONLY (no markdown fences, no explanation):
{"isMenu": true, "tuesday": ["item 1", ...], "wednesday": [...], "thursday": [...], "friday": [...]}

Each day should be an array of meal items (multiple items per day are possible, separated by "***" or similar markers). Keep the original German text and include prices. Use null (not an empty array) for a day with no meal.`;

interface RawResponse {
	isMenu?: boolean;
	tuesday?: string[] | string | null;
	wednesday?: string[] | string | null;
	thursday?: string[] | string | null;
	friday?: string[] | string | null;
}

function normalizeDay(
	value: string[] | string | null | undefined,
): string | null {
	if (value === null || value === undefined) return null;
	const items = Array.isArray(value) ? value : [value];
	if (items.length === 0) return null;
	return JSON.stringify(items);
}

// Returns the extracted menu, or null if the image isn't a menu.
export async function extractMenuFromImage(
	ai: Ai,
	imageUrl: string,
): Promise<{ meals: MenuData; raw: string } | null> {
	const imageResponse = await fetch(imageUrl);
	if (!imageResponse.ok) {
		throw new Error(`Failed to fetch image: ${imageResponse.status}`);
	}

	const contentType = imageResponse.headers.get("content-type") ?? "image/png";
	const imageBuffer = await imageResponse.arrayBuffer();
	const base64 = arrayBufferToBase64(imageBuffer);
	const dataUri = `data:${contentType};base64,${base64}`;

	const response = (await ai.run(
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		{
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: PROMPT },
						{ type: "image_url", image_url: { url: dataUri } },
					],
				},
			],
		} as Record<string, unknown>,
	)) as { response?: string };

	const raw = response.response ?? "";
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		console.log(`OCR: no JSON in response: ${raw.slice(0, 200)}`);
		return null;
	}

	let parsed: RawResponse;
	try {
		parsed = JSON.parse(jsonMatch[0]) as RawResponse;
	} catch (e) {
		console.log(`OCR: JSON parse failed: ${e}`);
		return null;
	}

	if (parsed.isMenu === false) {
		console.log("OCR: image is not a menu");
		return null;
	}

	const meals: MenuData = {
		tuesday: normalizeDay(parsed.tuesday),
		wednesday: normalizeDay(parsed.wednesday),
		thursday: normalizeDay(parsed.thursday),
		friday: normalizeDay(parsed.friday),
	};

	// Guard: if all days are empty, treat as non-menu.
	if (!meals.tuesday && !meals.wednesday && !meals.thursday && !meals.friday) {
		console.log("OCR: menu extracted but all days empty");
		return null;
	}

	return { meals, raw };
}
