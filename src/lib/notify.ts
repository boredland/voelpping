import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { menus, subscribers } from "../db/schema";
import type { Env, NotificationMessage } from "../env";
import { DAY_COLUMNS, DAY_NAMES_DE, getCurrentWeekTuesday } from "./dates";
import { parseMealItems } from "./meals";

export async function enqueueDailyNotifications(
	db: Db,
	env: Env,
	todayDow: number,
): Promise<void> {
	if (todayDow < 2 || todayDow > 5) return;

	const weekTuesday = getCurrentWeekTuesday();
	const menu = await db
		.select()
		.from(menus)
		.where(eq(menus.weekStart, weekTuesday))
		.limit(1);

	if (menu.length === 0) {
		console.log("No menu available for notifications");
		return;
	}

	const dayColumn = DAY_COLUMNS[todayDow as keyof typeof DAY_COLUMNS];
	const items = parseMealItems(menu[0][dayColumn]);
	if (items.length === 0) {
		console.log(`No meal for ${dayColumn}`);
		return;
	}

	const dayName = DAY_NAMES_DE[todayDow];
	const itemList = items.map((i) => `• ${i}`).join("\n");
	const text = `Guten Appetit! Heute bei Völp:\n\n<b>${dayName}</b>\n${itemList}`;

	const allActive = await db
		.select()
		.from(subscribers)
		.where(eq(subscribers.active, 1));

	const eligible = allActive.filter((sub) => {
		if (!sub.weekdays) return true;
		return sub.weekdays.split(",").map(Number).includes(todayDow);
	});

	if (eligible.length === 0) {
		console.log("No eligible subscribers");
		return;
	}

	const messages: NotificationMessage[] = eligible.map((sub) => ({
		chatId: sub.chatId,
		text,
	}));

	const batches: NotificationMessage[][] = [];
	for (let i = 0; i < messages.length; i += 10) {
		batches.push(messages.slice(i, i + 10));
	}

	for (const batch of batches) {
		await env.NOTIFICATION_QUEUE.sendBatch(batch.map((msg) => ({ body: msg })));
	}

	console.log(`Enqueued ${messages.length} notifications`);
}
