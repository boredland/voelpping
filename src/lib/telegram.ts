import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { menus, subscribers } from "../db/schema";
import {
	DAY_NAMES_DE,
	DAY_NAMES_EN,
	getCalendarWeek,
	getCurrentWeekTuesday,
	parseWeekdays,
} from "./dates";

interface TelegramUpdate {
	message?: {
		chat: { id: number };
		text?: string;
		from?: { language_code?: string };
	};
}

async function sendMessage(
	token: string,
	chatId: string,
	text: string,
): Promise<void> {
	const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: "HTML",
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		console.error(`Telegram sendMessage failed: ${res.status} ${body}`);
	}
}

export { sendMessage };

function isGerman(update: TelegramUpdate): boolean {
	const lang = update.message?.from?.language_code ?? "";
	return lang.startsWith("de");
}

export async function handleTelegramWebhook(
	db: Db,
	token: string,
	body: TelegramUpdate,
): Promise<void> {
	const msg = body.message;
	if (!msg?.text) return;

	const chatId = String(msg.chat.id);
	const text = msg.text.trim();
	const de = isGerman(body);
	const reply = (t: string) => sendMessage(token, chatId, t);

	if (text === "/start" || text === "/subscribe") {
		await db
			.insert(subscribers)
			.values({ chatId, active: 1 })
			.onConflictDoUpdate({ target: subscribers.chatId, set: { active: 1 } });

		await reply(
			de
				? "Willkommen beim Mittagstisch-Bot der Metzgerei Völp! 🥩\n\n" +
						"Du bekommst jetzt jeden Morgen (Di-Fr) eine Nachricht mit dem Tagesgericht.\n\n" +
						"/menu — Aktuelle Wochenkarte\n" +
						"/setday Di,Do — Nur bestimmte Tage\n" +
						"/unsubscribe — Abmelden"
				: "Welcome to the Metzgerei Völp lunch menu bot! 🥩\n\n" +
						"You'll receive a daily notification (Tue-Fri) with the day's meal.\n\n" +
						"/menu — Current weekly menu\n" +
						"/setday Tue,Thu — Specific days only\n" +
						"/unsubscribe — Unsubscribe",
		);
		return;
	}

	if (text === "/unsubscribe") {
		await db
			.update(subscribers)
			.set({ active: 0 })
			.where(eq(subscribers.chatId, chatId));
		await reply(
			de
				? "Du bist abgemeldet. /subscribe um dich wieder anzumelden."
				: "You've been unsubscribed. /subscribe to re-subscribe.",
		);
		return;
	}

	if (text.startsWith("/setday")) {
		const arg = text.slice("/setday".length).trim().toLowerCase();
		if (arg === "alle" || arg === "all" || arg === "") {
			await db
				.update(subscribers)
				.set({ weekdays: null })
				.where(eq(subscribers.chatId, chatId));
			await reply(
				de
					? "Du wirst an allen Tagen (Di-Fr) benachrichtigt."
					: "You'll be notified on all days (Tue-Fri).",
			);
		} else {
			const parsed = parseWeekdays(arg);
			if (!parsed) {
				await reply(
					de
						? "Ungültige Tage. Verwende: Di, Mi, Do, Fr (oder Tue, Wed, Thu, Fri)"
						: "Invalid days. Use: Di, Mi, Do, Fr (or Tue, Wed, Thu, Fri)",
				);
				return;
			}
			const dayNames = parsed
				.split(",")
				.map((d) => (de ? DAY_NAMES_DE : DAY_NAMES_EN)[Number(d)])
				.join(", ");
			await db
				.update(subscribers)
				.set({ weekdays: parsed })
				.where(eq(subscribers.chatId, chatId));
			await reply(
				de
					? `Benachrichtigungen auf ${dayNames} gesetzt.`
					: `Notifications set to ${dayNames}.`,
			);
		}
		return;
	}

	if (text === "/menu") {
		const weekTuesday = getCurrentWeekTuesday();
		const menu = await db
			.select()
			.from(menus)
			.where(eq(menus.weekStart, weekTuesday))
			.limit(1);

		if (menu.length === 0) {
			await reply(
				de
					? "Die Wochenkarte ist leider noch nicht verfügbar."
					: "This week's menu is not yet available.",
			);
			return;
		}

		const m = menu[0];
		const kw = getCalendarWeek(weekTuesday);
		const dn = de ? DAY_NAMES_DE : DAY_NAMES_EN;
		const rows = [
			m.tuesday ? [dn[2], m.tuesday] : null,
			m.wednesday ? [dn[3], m.wednesday] : null,
			m.thursday ? [dn[4], m.thursday] : null,
			m.friday ? [dn[5], m.friday] : null,
		].filter((r): r is [string, string] => r !== null);

		const maxDay = Math.max(...rows.map(([d]) => d.length));
		const header = de
			? `<b>Mittagstisch KW ${kw}</b>`
			: `<b>Lunch Menu CW ${kw}</b>`;
		const table = rows
			.map(([day, meal]) => `${day.padEnd(maxDay)}  ${meal}`)
			.join("\n");

		await reply(`${header}\n\n<pre>${table}</pre>`);
		return;
	}

	await reply(
		de
			? "Unbekannter Befehl. Versuche /menu oder /subscribe"
			: "Unknown command. Try /menu or /subscribe",
	);
}
