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

const PROMPT = `This is a weekly lunch menu ("Mittagstisch") from a German butcher shop, covering Tuesday through Friday.
Extract ALL meals/items for each day. A day may have multiple items.
Return ONLY valid JSON, no markdown fences, no explanation:
{"tuesday":["item 1","item 2"],"wednesday":["item"],"thursday":["item"],"friday":["item 1","item 2"]}
Keep the original German text. Include prices if shown.
If a day is missing or unreadable, use null for that day.`;

interface RawMenuData {
	tuesday: string[] | string | null;
	wednesday: string[] | string | null;
	thursday: string[] | string | null;
	friday: string[] | string | null;
}

function normalizeDay(value: string[] | string | null): string | null {
	if (value === null) return null;
	const items = Array.isArray(value) ? value : [value];
	return JSON.stringify(items);
}

export async function extractMenuFromImage(
	ai: Ai,
	imageUrl: string,
): Promise<{ meals: MenuData; raw: string }> {
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
		throw new Error(`Could not parse JSON from AI response: ${raw}`);
	}

	const parsed = JSON.parse(jsonMatch[0]) as RawMenuData;
	const meals: MenuData = {
		tuesday: normalizeDay(parsed.tuesday),
		wednesday: normalizeDay(parsed.wednesday),
		thursday: normalizeDay(parsed.thursday),
		friday: normalizeDay(parsed.friday),
	};
	return { meals, raw };
}
