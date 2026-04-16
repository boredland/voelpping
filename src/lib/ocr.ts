export interface MenuData {
	tuesday: string | null;
	wednesday: string | null;
	thursday: string | null;
	friday: string | null;
}

export async function extractMenuFromImage(
	ai: Ai,
	imageUrl: string,
): Promise<{ meals: MenuData; raw: string }> {
	const response = (await ai.run("@cf/google/gemma-4-26b-a4b-it", {
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `This is a weekly lunch menu ("Mittagstisch") from a German butcher shop, covering Tuesday through Friday.
Extract the meal for each day. Return ONLY valid JSON, no markdown fences, no explanation:
{"tuesday":"meal description","wednesday":"meal description","thursday":"meal description","friday":"meal description"}
Keep the original German text. Include the full meal description as written on the image.
If a day is missing or unreadable, use null for that day.`,
					},
					{
						type: "image_url",
						image_url: {
							url: imageUrl,
						},
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
