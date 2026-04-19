const FACEBOOK_FEED_URL = "https://rss.app/feeds/v1.1/mcTHhkbKVvbB47IT.json";

interface FeedItem {
	id: string;
	url: string;
	title: string;
	content_text?: string;
	image?: string;
	date_published: string;
}

interface JsonFeed {
	items: FeedItem[];
}

// Returns the most recent image URLs from the Facebook feed, newest first.
// We return multiple candidates so callers can OCR them in order and pick
// the first that actually looks like a menu (the FB page also posts other
// graphics which we need to skip past).
export async function findMenuImageCandidates(limit = 5): Promise<string[]> {
	const res = await fetch(FACEBOOK_FEED_URL);
	if (!res.ok) {
		console.error(`Failed to fetch feed: ${res.status}`);
		return [];
	}

	const feed = (await res.json()) as JsonFeed;
	const images = feed.items
		.filter((item): item is FeedItem & { image: string } => Boolean(item.image))
		.slice(0, limit)
		.map((item) => item.image);

	console.log(`Found ${images.length} candidate image(s) in feed`);
	return images;
}
