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

export async function findMenuImageUrl(): Promise<string | null> {
	const res = await fetch(FACEBOOK_FEED_URL);
	if (!res.ok) {
		console.error(`Failed to fetch feed: ${res.status}`);
		return null;
	}

	const feed = (await res.json()) as JsonFeed;

	// Menu posts have no caption (empty content_text) — text posts are news, not menus.
	// Pick the most recent such post; items are already ordered newest-first.
	const menuPost = feed.items.find(
		(item) => item.image && !item.content_text?.trim(),
	);

	if (!menuPost) {
		console.log("No menu-like post found in feed");
		return null;
	}

	console.log(`Menu post: ${menuPost.date_published} → ${menuPost.image}`);
	return menuPost.image ?? null;
}
