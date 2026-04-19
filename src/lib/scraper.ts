const FACEBOOK_FEED_URL =
	"https://fetchrss.com/feed/1wESJPEKh0Cg1wESFN1eN34k.rss";

// Returns image URLs from the most recent feed items, newest first.
// FetchRSS embeds *all* photos from a carousel post inside <description>
// as <img src="..."> tags, so we extract every src to get all candidates.
// rss.app's JSON feed only returned the first photo per post.
export async function findMenuImageCandidates(
	itemLimit = 5,
	imagesPerItem = 10,
): Promise<string[]> {
	const res = await fetch(FACEBOOK_FEED_URL);
	if (!res.ok) {
		console.error(`Failed to fetch feed: ${res.status}`);
		return [];
	}

	const xml = await res.text();
	const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
		.slice(0, itemLimit)
		.map((m) => m[1]);

	const urls: string[] = [];
	for (const item of items) {
		const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);
		const desc = descMatch?.[1] ?? "";
		// Description is wrapped in CDATA or HTML-escaped — extract src attrs from
		// either form. Decode &amp; back to & for valid Facebook CDN URLs.
		const imgs = [...desc.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) =>
			m[1].replace(/&amp;/g, "&"),
		);
		for (const u of imgs) {
			if (urls.length >= itemLimit * imagesPerItem) break;
			if (!urls.includes(u)) urls.push(u);
		}
	}

	console.log(
		`Found ${urls.length} candidate image(s) across ${items.length} item(s)`,
	);
	return urls;
}
