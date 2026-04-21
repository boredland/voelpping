const MODEL = "@cf/black-forest-labs/flux-1-schnell";

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function buildPrompt(itemsEn: string[]): string {
	const dish = itemsEn.join(", ");
	return `Appetizing food photography of a German lunch plate: ${dish}. Warm natural lighting, overhead angle, restaurant plating, shallow depth of field, no text, no logos, no watermarks.`;
}

export async function generateMealImage(
	ai: Ai,
	itemsEn: string[],
): Promise<Uint8Array> {
	if (itemsEn.length === 0) {
		throw new Error("generateMealImage: empty items");
	}

	const prompt = buildPrompt(itemsEn);
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
