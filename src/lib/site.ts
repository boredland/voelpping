import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { menus } from "../db/schema";
import {
	DAY_NAMES_DE,
	DAY_NAMES_EN,
	getCalendarWeek,
	getCurrentWeekTuesday,
} from "./dates";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export async function renderSite(
	db: Db,
	botUsername: string,
): Promise<Response> {
	const weekTuesday = getCurrentWeekTuesday();
	const currentMenu = await db
		.select()
		.from(menus)
		.where(eq(menus.weekStart, weekTuesday))
		.limit(1);

	const recentMenus = await db
		.select()
		.from(menus)
		.orderBy(desc(menus.weekStart))
		.limit(5);

	const menu = currentMenu[0] ?? null;
	const kw = getCalendarWeek(weekTuesday);

	const mealRowsDe = menu
		? ([2, 3, 4, 5] as const)
				.map((d) => {
					const col = {
						2: "tuesday",
						3: "wednesday",
						4: "thursday",
						5: "friday",
					} as const;
					const meal = menu[col[d]];
					if (!meal) return "";
					return `<tr><td>${DAY_NAMES_DE[d]}</td><td>${escapeHtml(meal)}</td></tr>`;
				})
				.join("\n")
		: "";

	const mealRowsEn = menu
		? ([2, 3, 4, 5] as const)
				.map((d) => {
					const col = {
						2: "tuesday",
						3: "wednesday",
						4: "thursday",
						5: "friday",
					} as const;
					const meal = menu[col[d]];
					if (!meal) return "";
					return `<tr><td>${DAY_NAMES_EN[d]}</td><td>${escapeHtml(meal)}</td></tr>`;
				})
				.join("\n")
		: "";

	const historyRows = recentMenus
		.map((m) => {
			const kw = getCalendarWeek(m.weekStart);
			const meals = [m.tuesday, m.wednesday, m.thursday, m.friday]
				.filter((s): s is string => Boolean(s))
				.map(escapeHtml)
				.join(" · ");
			return `<tr><td>KW ${kw} (${m.weekStart})</td><td>${meals || "—"}</td></tr>`;
		})
		.join("\n");

	const html = `<!DOCTYPE html>
<html lang="de">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="light dark">
	<title>Mittagstisch – Metzgerei Völp</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍖</text></svg>">
	<style>
		:root {
			--bg: #faf9f7;
			--text: #333;
			--text-muted: #666;
			--card-bg: #fff;
			--card-shadow: rgba(0,0,0,0.08);
			--border: #eee;
			--btn-bg: #333;
			--btn-text: #fff;
			--btn-border: #ccc;
			--link-bg: #0088cc;
			--link-bg-hover: #006da3;
		}
		@media (prefers-color-scheme: dark) {
			:root {
				--bg: #1a1a1a;
				--text: #e0e0e0;
				--text-muted: #999;
				--card-bg: #262626;
				--card-shadow: rgba(0,0,0,0.3);
				--border: #333;
				--btn-bg: #e0e0e0;
				--btn-text: #1a1a1a;
				--btn-border: #555;
				--link-bg: #2a9fd6;
				--link-bg-hover: #1d8abf;
			}
		}
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); max-width: 640px; margin: 0 auto; padding: 1rem; }
		h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
		.subtitle { color: var(--text-muted); margin-bottom: 1.5rem; }
		.lang-toggle { text-align: right; margin-bottom: 1rem; }
		.lang-toggle button { background: none; border: 1px solid var(--btn-border); border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.85rem; color: var(--text); }
		.lang-toggle button.active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
		section { background: var(--card-bg); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px var(--card-shadow); }
		table { width: 100%; border-collapse: collapse; }
		td { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
		td:first-child { font-weight: 600; white-space: nowrap; width: 120px; }
		.subscribe-link { display: inline-block; background: var(--link-bg); color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; margin-top: 0.5rem; }
		.subscribe-link:hover { background: var(--link-bg-hover); }
		.empty { color: var(--text-muted); font-style: italic; }
		h2 { font-size: 1.1rem; margin-bottom: 0.75rem; }
		.history td { font-size: 0.85rem; }
		footer { text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-top: 2rem; }
		footer a { color: var(--text-muted); }
		[lang="en"] { display: none; }
		body.en [lang="de"] { display: none; }
		body.en [lang="en"] { display: revert; }
	</style>
</head>
<body>
	<div class="lang-toggle">
		<button id="btn-de" class="active" onclick="setLang('de')">DE</button>
		<button id="btn-en" onclick="setLang('en')">EN</button>
	</div>

	<h1 lang="de">🥩 Mittagstisch</h1>
	<h1 lang="en">🥩 Lunch Menu</h1>
	<p class="subtitle" lang="de">Metzgerei Völp – KW ${kw}</p>
	<p class="subtitle" lang="en">Metzgerei Völp – CW ${kw}</p>

	<section>
		${
			menu
				? `<div lang="de"><table>${mealRowsDe}</table></div>
				   <div lang="en"><table>${mealRowsEn}</table></div>`
				: `<p class="empty" lang="de">Die Wochenkarte ist noch nicht verfügbar.</p>
				   <p class="empty" lang="en">This week's menu is not yet available.</p>`
		}
	</section>

	<section>
		<h2 lang="de">Täglich benachrichtigt werden</h2>
		<h2 lang="en">Get daily notifications</h2>
		<p lang="de">Erhalte jeden Morgen (Di–Fr) das Tagesgericht per Telegram:</p>
		<p lang="en">Receive the daily meal every morning (Tue–Fri) via Telegram:</p>
		<a class="subscribe-link" href="https://t.me/${escapeHtml(botUsername)}">Telegram Bot</a>
	</section>

	${
		recentMenus.length > 0
			? `<section>
				<h2 lang="de">Letzte Wochen</h2>
				<h2 lang="en">Recent Weeks</h2>
				<table class="history">${historyRows}</table>
			</section>`
			: ""
	}

	<footer>
		<span lang="de">Daten von</span>
		<span lang="en">Data from</span>
		<a href="https://metzgerei-voelp.de/aktuelles/">metzgerei-voelp.de</a>
	</footer>

	<script>
		function setLang(lang) {
			document.body.className = lang === 'en' ? 'en' : '';
			document.getElementById('btn-de').className = lang === 'de' ? 'active' : '';
			document.getElementById('btn-en').className = lang === 'en' ? 'active' : '';
			localStorage.setItem('lang', lang);
		}
		const saved = localStorage.getItem('lang');
		if (saved) setLang(saved);
	</script>
</body>
</html>`;

	return new Response(html, {
		headers: { "content-type": "text/html;charset=utf-8" },
	});
}
