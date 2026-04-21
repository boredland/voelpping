import { parseMealItems } from "./meals";
import type { MenuData } from "./ocr";

const DEEPL_ENDPOINT = "https://api-free.deepl.com/v2/translate";

type DayKey = keyof MenuData;
const DAYS: readonly DayKey[] = [
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
] as const;

interface DeepLResponse {
	translations?: { text: string }[];
}

// Translates all meal items in one DeepL request and returns a MenuData with
// the same shape (JSON-stringified arrays, null when the source day is null).
export async function translateMeals(
	apiKey: string,
	meals: MenuData,
): Promise<MenuData> {
	const segments: { day: DayKey; items: string[] }[] = DAYS.map((day) => ({
		day,
		items: parseMealItems(meals[day]),
	}));

	const flat = segments.flatMap((s) => s.items);
	if (flat.length === 0) {
		return { tuesday: null, wednesday: null, thursday: null, friday: null };
	}

	const body = new URLSearchParams();
	for (const t of flat) body.append("text", t);
	body.set("source_lang", "DE");
	body.set("target_lang", "EN-US");
	body.set("preserve_formatting", "1");

	const res = await fetch(DEEPL_ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `DeepL-Auth-Key ${apiKey}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		body,
	});
	if (!res.ok) {
		throw new Error(`DeepL ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as DeepLResponse;
	const translations = data.translations ?? [];
	if (translations.length !== flat.length) {
		throw new Error(
			`DeepL returned ${translations.length} translations for ${flat.length} inputs`,
		);
	}

	const out: MenuData = {
		tuesday: null,
		wednesday: null,
		thursday: null,
		friday: null,
	};
	let cursor = 0;
	for (const { day, items } of segments) {
		if (items.length === 0) continue;
		const slice = translations
			.slice(cursor, cursor + items.length)
			.map((t) => t.text);
		cursor += items.length;
		out[day] = JSON.stringify(slice);
	}
	return out;
}
