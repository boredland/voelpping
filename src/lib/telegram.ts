import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { menus, subscribers } from "../db/schema";
import {
	DAY_NAMES_DE,
	DAY_NAMES_EN,
	formatMenuWeekRange,
	getBerlinDayOfWeek,
	getCalendarWeek,
	getCurrentWeekTuesday,
} from "./dates";
import { parseMealItems } from "./meals";

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
): Promise<Response> {
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
		const body = await res.clone().text();
		console.error(`Telegram sendMessage failed: ${res.status} ${body}`);
	}
	return res;
}

// Telegram caption limit is 1024 characters. Longer messages get split: photo
// with a truncated caption, followed by the full text as a separate message.
const CAPTION_LIMIT = 1024;

async function sendPhoto(
	token: string,
	chatId: string,
	photoUrl: string,
	caption: string,
): Promise<Response> {
	const short = caption.length <= CAPTION_LIMIT;
	const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			photo: photoUrl,
			...(short ? { caption, parse_mode: "HTML" } : {}),
		}),
	});
	if (!res.ok) {
		const body = await res.clone().text();
		console.error(`Telegram sendPhoto failed: ${res.status} ${body}`);
	}
	if (!short) {
		await sendMessage(token, chatId, caption);
	}
	return res;
}

export { sendMessage, sendPhoto };

function detectLangFromCode(code: string | undefined): "de" | "en" {
	return code?.toLowerCase().startsWith("de") ? "de" : "en";
}

// Resolve the language for this interaction, preferring the subscriber's
// stored preference, falling back to the Telegram message's language_code.
async function resolveLang(
	db: Db,
	chatId: string,
	update: TelegramUpdate,
): Promise<"de" | "en"> {
	const rows = await db
		.select({ language: subscribers.language })
		.from(subscribers)
		.where(eq(subscribers.chatId, chatId))
		.limit(1);
	const stored = rows[0]?.language;
	if (stored === "de" || stored === "en") return stored;
	return detectLangFromCode(update.message?.from?.language_code);
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
	const lang = await resolveLang(db, chatId, body);
	const de = lang === "de";
	const reply = (t: string) => sendMessage(token, chatId, t);

	if (text === "/start" || text === "/subscribe") {
		const detected = detectLangFromCode(msg.from?.language_code);
		await db
			.insert(subscribers)
			.values({ chatId, active: 1, language: detected })
			.onConflictDoUpdate({
				target: subscribers.chatId,
				set: { active: 1 },
			});

		const welcomeDe = detected === "de";
		await reply(
			welcomeDe
				? "Willkommen beim Mittagstisch-Bot der Metzgerei Völp! 🥩\n\n" +
						"Du bekommst jetzt jeden Morgen (Di-Fr) eine Nachricht mit dem Tagesgericht.\n\n" +
						"/menu — Aktuelle Wochenkarte\n" +
						"/lang — Sprache wechseln (DE/EN)\n" +
						"/unsubscribe — Abmelden"
				: "Welcome to the Metzgerei Völp lunch menu bot! 🥩\n\n" +
						"You'll receive a daily notification (Tue-Fri) with the day's meal.\n\n" +
						"/menu — Current weekly menu\n" +
						"/lang — Switch language (DE/EN)\n" +
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

	if (text.startsWith("/lang")) {
		const arg = text.slice("/lang".length).trim().toLowerCase();
		let next: "de" | "en";
		if (arg === "de" || arg === "deutsch" || arg === "german") {
			next = "de";
		} else if (arg === "en" || arg === "english" || arg === "englisch") {
			next = "en";
		} else if (arg === "") {
			next = lang === "de" ? "en" : "de";
		} else {
			await reply(
				de
					? "Ungültige Sprache. Verwende: /lang de, /lang en, oder /lang zum Umschalten."
					: "Invalid language. Use: /lang de, /lang en, or /lang to toggle.",
			);
			return;
		}
		await db
			.insert(subscribers)
			.values({ chatId, active: 1, language: next })
			.onConflictDoUpdate({
				target: subscribers.chatId,
				set: { language: next },
			});
		await reply(
			next === "de"
				? "Sprache auf Deutsch gesetzt."
				: "Language set to English.",
		);
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
		const todayDow = getBerlinDayOfWeek();
		const minDow = todayDow >= 2 && todayDow <= 5 ? todayDow : 2;
		const pick = (enVal: string | null, deVal: string | null) =>
			de ? deVal : (enVal ?? deVal);
		const days = (
			[
				[2, dn[2], parseMealItems(pick(m.tuesdayEn, m.tuesday))],
				[3, dn[3], parseMealItems(pick(m.wednesdayEn, m.wednesday))],
				[4, dn[4], parseMealItems(pick(m.thursdayEn, m.thursday))],
				[5, dn[5], parseMealItems(pick(m.fridayEn, m.friday))],
			] as const
		).filter(([dow, , items]) => dow >= minDow && items.length > 0);

		if (days.length === 0) {
			await reply(
				de
					? "Für heute/diese Woche gibt es keinen Mittagstisch mehr."
					: "No more lunch menu for today/this week.",
			);
			return;
		}

		const range = formatMenuWeekRange(weekTuesday);
		const header = de
			? `<b>Mittagstisch KW ${kw}</b> (${range})`
			: `<b>Lunch Menu CW ${kw}</b> (${range})`;
		const body = days
			.map(([, day, items]) => {
				const itemList = items.map((i) => `  • ${i}`).join("\n");
				return `<b>${day}</b>\n${itemList}`;
			})
			.join("\n\n");

		await reply(`${header}\n\n${body}`);
		return;
	}

	await reply(
		de
			? "Unbekannter Befehl. Versuche /menu oder /subscribe"
			: "Unknown command. Try /menu or /subscribe",
	);
}
