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
Extract the meal for each day. Return ONLY valid JSON, no markdown fences, no explanation:
{"tuesday":"meal description","wednesday":"meal description","thursday":"meal description","friday":"meal description"}
Keep the original German text. Include the full meal description as written on the image.
If a day is missing or unreadable, use null for that day.`;

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
	const imageArray = [...new Uint8Array(imageBuffer)];
	const base64 = arrayBufferToBase64(imageBuffer);
	const dataUri = `data:${contentType};base64,${base64}`;

	console.log(`Image: ${contentType}, ${imageBuffer.byteLength} bytes`);

	// Approach 1: top-level image field (like Llama tutorial) with Gemma 4
	console.log("Trying: gemma-4 with top-level image field");
	const resp1 = (await ai.run("@cf/google/gemma-4-26b-a4b-it", {
		messages: [{ role: "user", content: PROMPT }],
		image: imageArray,
	} as Record<string, unknown>)) as { response?: string };
	console.log(`gemma-4 image-field: ${(resp1.response ?? "").length} chars`);

	if (resp1.response?.match(/\{[\s\S]*\}/)) {
		const raw = resp1.response;
		return { meals: JSON.parse(raw.match(/\{[\s\S]*\}/)![0]), raw };
	}

	// Approach 2: data URI in messages content array with Gemma 4
	console.log("Trying: gemma-4 with data URI in messages");
	const resp2 = (await ai.run("@cf/google/gemma-4-26b-a4b-it", {
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: PROMPT },
					{ type: "image_url", image_url: { url: dataUri } },
				],
			},
		],
	} as Record<string, unknown>)) as { response?: string };
	console.log(`gemma-4 data-uri: ${(resp2.response ?? "").length} chars`);

	if (resp2.response?.match(/\{[\s\S]*\}/)) {
		const raw = resp2.response;
		return { meals: JSON.parse(raw.match(/\{[\s\S]*\}/)![0]), raw };
	}

	// Approach 3: mistral-small with data URI
	console.log("Trying: mistral-small with data URI in messages");
	const resp3 = (await ai.run(
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
	console.log(`mistral data-uri: ${(resp3.response ?? "").length} chars`);

	if (resp3.response?.match(/\{[\s\S]*\}/)) {
		const raw = resp3.response;
		return { meals: JSON.parse(raw.match(/\{[\s\S]*\}/)![0]), raw };
	}

	// Approach 4: LLaVA (dedicated image-to-text model)
	console.log("Trying: llava with top-level image field");
	const resp4 = (await ai.run("@cf/llava-hf/llava-1.5-7b-hf", {
		messages: [{ role: "user", content: PROMPT }],
		image: imageArray,
	} as Record<string, unknown>)) as { response?: string };
	console.log(`llava: ${(resp4.response ?? "").length} chars`);

	const raw = resp4.response ?? "";
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		const allResponses = [
			resp1.response,
			resp2.response,
			resp3.response,
			resp4.response,
		]
			.map((r, i) => `[${i}]: "${r ?? ""}"`)
			.join(", ");
		throw new Error(`No model returned valid JSON. Responses: ${allResponses}`);
	}

	const meals = JSON.parse(jsonMatch[0]) as MenuData;
	return { meals, raw };
}
