import { eq } from "drizzle-orm";
import { createDb } from "./db/client";
import { menus, subscribers } from "./db/schema";
import type { Env, NotificationMessage } from "./env";
import { getBerlinDayOfWeek, getCurrentWeekTuesday } from "./lib/dates";
import { enqueueDailyNotifications } from "./lib/notify";
import { extractMenuFromImage } from "./lib/ocr";
import { findMenuImageUrl } from "./lib/scraper";
import { renderSite } from "./lib/site";
import { handleTelegramWebhook } from "./lib/telegram";

async function scrapeAndStore(
	db: ReturnType<typeof createDb>,
	env: Env,
): Promise<void> {
	const imageUrl = await findMenuImageUrl();
	if (!imageUrl) return;

	const weekTuesday = getCurrentWeekTuesday();
	const existing = await db
		.select()
		.from(menus)
		.where(eq(menus.weekStart, weekTuesday))
		.limit(1);

	if (existing.length > 0 && existing[0].imageUrl === imageUrl) {
		console.log("Menu already stored for this week");
		return;
	}

	if (existing.length > 0 && existing[0].imageUrl !== imageUrl) {
		console.log("New image detected for current week, updating");
	}

	console.log(`Extracting menu from: ${imageUrl}`);
	const { meals, raw } = await extractMenuFromImage(env.AI, imageUrl);

	await db
		.insert(menus)
		.values({
			weekStart: weekTuesday,
			imageUrl,
			tuesday: meals.tuesday,
			wednesday: meals.wednesday,
			thursday: meals.thursday,
			friday: meals.friday,
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
				rawOcr: raw,
			},
		});

	console.log(`Menu stored for week ${weekTuesday}`);
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
			const { chatId, text } = message.body;
			try {
				const res = await fetch(
					`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							chat_id: chatId,
							text,
							parse_mode: "HTML",
						}),
					},
				);

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
