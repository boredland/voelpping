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

	const contentType = imageResponse.headers.get("content-type") ?? "image/png";
	const imageBuffer = await imageResponse.arrayBuffer();
	const base64 = arrayBufferToBase64(imageBuffer);
	const dataUri = `data:${contentType};base64,${base64}`;

	console.log(
		`Sending image to AI: ${contentType}, ${imageBuffer.byteLength} bytes`,
	);

	const models = [
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		"@cf/google/gemma-4-26b-a4b-it",
	] as const;

	const prompt = `This is a weekly lunch menu ("Mittagstisch") from a German butcher shop, covering Tuesday through Friday.
Extract the meal for each day. Return ONLY valid JSON, no markdown fences, no explanation:
{"tuesday":"meal description","wednesday":"meal description","thursday":"meal description","friday":"meal description"}
Keep the original German text. Include the full meal description as written on the image.
If a day is missing or unreadable, use null for that day.`;

	let raw = "";
	for (const model of models) {
		console.log(`Trying model: ${model}`);
		const response = (await ai.run(model, {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{ type: "image_url", image_url: { url: dataUri } },
					],
				},
			],
		} as Record<string, unknown>)) as { response?: string };

		raw = response.response ?? "";
		console.log(`Model ${model} response (${raw.length} chars): ${raw.slice(0, 200)}`);
		if (raw.match(/\{[\s\S]*\}/)) break;
	}

	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error(`Could not parse JSON from AI response: ${raw}`);
	}

	const meals = JSON.parse(jsonMatch[0]) as MenuData;
	return { meals, raw };
}
