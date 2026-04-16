const AKTUELLES_URL = "https://metzgerei-voelp.de/aktuelles/";

const MITTAGSTISCH_IMAGE_RE =
	/href="(https:\/\/metzgerei-voelp\.de\/wp-content\/uploads\/[^"]*mittagstisch[^"]*\.(?:png|jpg|jpeg|webp))"/i;

export async function findMenuImageUrl(): Promise<string | null> {
	const res = await fetch(AKTUELLES_URL);
	if (!res.ok) {
		console.error(`Failed to fetch ${AKTUELLES_URL}: ${res.status}`);
		return null;
	}

	const html = await res.text();
	const match = html.match(MITTAGSTISCH_IMAGE_RE);
	if (!match) {
		console.log("No mittagstisch image found on page");
		return null;
	}

	return match[1];
}
