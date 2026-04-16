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

export async function extractMenuFromImage(
	ai: Ai,
	imageUrl: string,
): Promise<{ meals: MenuData; raw: string }> {
	const imageResponse = await fetch(imageUrl);
	if (!imageResponse.ok) {
		throw new Error(`Failed to fetch image: ${imageResponse.status}`);
	}

	const imageBuffer = await imageResponse.arrayBuffer();
	const base64 = arrayBufferToBase64(imageBuffer);

	const response = (await ai.run("@cf/google/gemma-4-26b-a4b-it", {
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image_url",
						image_url: {
							url: `data:image/png;base64,${base64}`,
						},
					},
					{
						type: "text",
						text: `This is a weekly lunch menu ("Mittagstisch") from a German butcher shop, covering Tuesday through Friday.
Extract the meal for each day. Return ONLY valid JSON, no markdown fences, no explanation:
{"tuesday":"meal description","wednesday":"meal description","thursday":"meal description","friday":"meal description"}
Keep the original German text. Include the full meal description as written on the image.
If a day is missing or unreadable, use null for that day.`,
					},
				],
			},
		],
	} as Record<string, unknown>)) as { response?: string };

	const raw = response.response ?? "";
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error(`Could not parse JSON from AI response: ${raw}`);
	}

	const meals = JSON.parse(jsonMatch[0]) as MenuData;
	return { meals, raw };
}
