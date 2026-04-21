import { eq } from "drizzle-orm";
import { createDb } from "./db/client";
import { menus, subscribers } from "./db/schema";
import type { Env, NotificationMessage } from "./env";
import {
	DAY_COLUMNS,
	getBerlinDayOfWeek,
	getCurrentWeekTuesday,
} from "./lib/dates";
import { generateMealImage } from "./lib/image";
import { parseMealItems } from "./lib/meals";
import { enqueueDailyNotifications } from "./lib/notify";
import { extractMenuFromImage, type MenuData } from "./lib/ocr";
import { findMenuImageCandidates } from "./lib/scraper";
import { renderSite } from "./lib/site";
import { uploadMenuImage } from "./lib/storage";
import {
	handleTelegramWebhook,
	sendMediaGroup,
	sendMessage,
	sendPhoto,
} from "./lib/telegram";
import { translateMeals } from "./lib/translate";

async function storeMenuForUrl(
	db: ReturnType<typeof createDb>,
	env: Env,
	imageUrl: string,
	weekTuesday: string,
): Promise<boolean> {
	console.log(`Trying image: ${imageUrl}`);
	const result = await extractMenuFromImage(env.AI, imageUrl);
	if (!result) return false;

	const { meals, raw } = result;
	await db
		.insert(menus)
		.values({
			weekStart: weekTuesday,
			imageUrl,
			tuesday: meals.tuesday,
			wednesday: meals.wednesday,
			thursday: meals.thursday,
			friday: meals.friday,
			tuesdayEn: null,
			wednesdayEn: null,
			thursdayEn: null,
			fridayEn: null,
			tuesdayImage: null,
			wednesdayImage: null,
			thursdayImage: null,
			fridayImage: null,
			rawOcr: raw,
		})
		.onConflictDoUpdate({
			target: menus.weekStart,
			set: {
				imageUrl,
				tuesday: meals.tuesday,
				wednesday: meals.wednesday,
				thursday: meals.thursday,
				friday: meals.friday,
				tuesdayEn: null,
				wednesdayEn: null,
				thursdayEn: null,
				fridayEn: null,
				tuesdayImage: null,
				wednesdayImage: null,
				thursdayImage: null,
				fridayImage: null,
				rawOcr: raw,
			},
		});

	console.log(`Menu stored for week ${weekTuesday}`);
	await enrichMenu(db, env, weekTuesday, meals);
	return true;
}

async function enrichMenu(
	db: ReturnType<typeof createDb>,
	env: Env,
	weekTuesday: string,
	meals: MenuData,
): Promise<void> {
	let mealsEn: MenuData;
	try {
		mealsEn = await translateMeals(env.DEEPL_API_KEY, meals);
	} catch (e) {
		console.error("Translation failed:", e);
		return;
	}

	const days = [2, 3, 4, 5] as const;
	const imagesByDay: Record<keyof typeof DAY_COLUMNS, string[]> = {
		2: [],
		3: [],
		4: [],
		5: [],
	};

	await Promise.all(
		days.flatMap((dow) => {
			const col = DAY_COLUMNS[dow];
			const itemsEn = parseMealItems(mealsEn[col]);
			return itemsEn.map(async (item, idx) => {
				try {
					const bytes = await generateMealImage(env.AI, item);
					const url = await uploadMenuImage(
						env.MENU_IMAGES,
						env.R2_PUBLIC_BASE_URL,
						weekTuesday,
						col,
						idx,
						bytes,
					);
					imagesByDay[dow][idx] = url;
				} catch (e) {
					console.error(`Image gen/upload failed for ${col}[${idx}]:`, e);
				}
			});
		}),
	);

	const serialize = (urls: string[]): string | null =>
		urls.filter(Boolean).length > 0
			? JSON.stringify(urls.filter(Boolean))
			: null;

	await db
		.update(menus)
		.set({
			tuesdayEn: mealsEn.tuesday,
			wednesdayEn: mealsEn.wednesday,
			thursdayEn: mealsEn.thursday,
			fridayEn: mealsEn.friday,
			tuesdayImage: serialize(imagesByDay[2]),
			wednesdayImage: serialize(imagesByDay[3]),
			thursdayImage: serialize(imagesByDay[4]),
			fridayImage: serialize(imagesByDay[5]),
		})
		.where(eq(menus.weekStart, weekTuesday));

	console.log(`Enriched menu for week ${weekTuesday}`);
}

async function scrapeAndStore(
	db: ReturnType<typeof createDb>,
	env: Env,
): Promise<void> {
	const candidates = await findMenuImageCandidates();
	if (candidates.length === 0) return;

	const weekTuesday = getCurrentWeekTuesday();
	const existing = await db
		.select()
		.from(menus)
		.where(eq(menus.weekStart, weekTuesday))
		.limit(1);

	// Short-circuit if the newest candidate matches what we already stored.
	if (existing.length > 0 && existing[0].imageUrl === candidates[0]) {
		console.log("Menu already stored for this week");
		return;
	}

	for (const imageUrl of candidates) {
		if (existing.length > 0 && existing[0].imageUrl === imageUrl) {
			console.log(`Skipping candidate ${imageUrl} — already stored`);
			return;
		}

		const stored = await storeMenuForUrl(db, env, imageUrl, weekTuesday);
		if (stored) return;
		console.log("Candidate is not a menu, trying next");
	}

	console.log("No menu found among candidates");
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (
			url.pathname === `/webhook/${env.TELEGRAM_BOT_TOKEN}` &&
			request.method === "POST"
		) {
			const body = (await request.json()) as Parameters<
				typeof handleTelegramWebhook
			>[2];
			const db = createDb(env.DB);
			try {
				await handleTelegramWebhook(db, env.TELEGRAM_BOT_TOKEN, body);
			} catch (e) {
				console.error("Webhook handler error:", e);
			}
			return new Response("ok");
		}

		if (url.pathname === `/trigger/${env.TELEGRAM_BOT_TOKEN}`) {
			const db = createDb(env.DB);
			const force = url.searchParams.has("force");
			const overrideUrl = url.searchParams.get("url");
			try {
				if (force || overrideUrl) {
					const weekTuesday = getCurrentWeekTuesday();
					await db.delete(menus).where(eq(menus.weekStart, weekTuesday));
					console.log(`Cleared menu for ${weekTuesday}`);
				}

				if (overrideUrl) {
					const weekTuesday = getCurrentWeekTuesday();
					const ok = await storeMenuForUrl(db, env, overrideUrl, weekTuesday);
					if (!ok) {
						return new Response("override image was not recognized as a menu", {
							status: 400,
						});
					}
				} else {
					await scrapeAndStore(db, env);
				}

				const todayDow = getBerlinDayOfWeek();
				if (todayDow >= 2 && todayDow <= 5) {
					await enqueueDailyNotifications(db, env, todayDow);
				}
				return new Response("triggered");
			} catch (e) {
				console.error("Manual trigger error:", e);
				return new Response(`error: ${e}`, { status: 500 });
			}
		}

		if (url.pathname === "/icon.svg") {
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍖</text></svg>`;
			return new Response(svg, {
				headers: {
					"content-type": "image/svg+xml",
					"cache-control": "public, max-age=31536000, immutable",
				},
			});
		}

		if (url.pathname === "/" || url.pathname === "") {
			const db = createDb(env.DB);
			return renderSite(db, env.BOT_USERNAME);
		}

		return new Response("not found", { status: 404 });
	},

	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		const db = createDb(env.DB);

		try {
			await scrapeAndStore(db, env);
		} catch (e) {
			console.error("Scrape error:", e);
		}

		const todayDow = getBerlinDayOfWeek();
		if (todayDow >= 2 && todayDow <= 5) {
			try {
				await enqueueDailyNotifications(db, env, todayDow);
			} catch (e) {
				console.error("Notification error:", e);
			}
		}
	},

	async queue(
		batch: MessageBatch<NotificationMessage>,
		env: Env,
	): Promise<void> {
		const db = createDb(env.DB);

		for (const message of batch.messages) {
			const { chatId, text, imageUrls } = message.body;
			try {
				const urls = imageUrls ?? [];
				const res =
					urls.length >= 2
						? await sendMediaGroup(env.TELEGRAM_BOT_TOKEN, chatId, urls, text)
						: urls.length === 1
							? await sendPhoto(env.TELEGRAM_BOT_TOKEN, chatId, urls[0], text)
							: await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text);

				if (res.status === 403) {
					console.log(`User ${chatId} blocked bot, deactivating`);
					await db
						.update(subscribers)
						.set({ active: 0 })
						.where(eq(subscribers.chatId, chatId));
				}

				message.ack();
			} catch (e) {
				console.error(`Failed to send to ${chatId}:`, e);
				message.retry();
			}
		}
	},
} satisfies ExportedHandler<Env, NotificationMessage>;
