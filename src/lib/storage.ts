export async function uploadMenuImage(
	bucket: R2Bucket,
	baseUrl: string,
	weekStart: string,
	day: string,
	index: number,
	bytes: Uint8Array,
	contentType = "image/png",
): Promise<string> {
	const ext = contentType === "image/jpeg" ? "jpg" : "png";
	const key = `${weekStart}/${day}-${index}.${ext}`;
	await bucket.put(key, bytes, {
		httpMetadata: { contentType },
	});
	return `${baseUrl.replace(/\/$/, "")}/${key}`;
}
