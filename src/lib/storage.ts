export async function uploadMenuImage(
	bucket: R2Bucket,
	baseUrl: string,
	weekStart: string,
	day: string,
	bytes: Uint8Array,
	contentType = "image/png",
): Promise<string> {
	const key = `${weekStart}/${day}.${contentType === "image/jpeg" ? "jpg" : "png"}`;
	await bucket.put(key, bytes, {
		httpMetadata: { contentType },
	});
	return `${baseUrl.replace(/\/$/, "")}/${key}`;
}
