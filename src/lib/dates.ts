const BERLIN_TZ = "Europe/Berlin";

export function getBerlinHour(): number {
	return Number(
		new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			hour12: false,
			timeZone: BERLIN_TZ,
		}).format(new Date()),
	);
}

export function getBerlinDayOfWeek(): number {
	const formatter = new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		timeZone: BERLIN_TZ,
	});
	const day = formatter.format(new Date());
	const map: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	};
	return map[day] ?? 0;
}

// Returns the Tuesday of the current/upcoming menu week.
// On Tue-Fri: the Tuesday of the current week.
// On Sat/Sun/Mon: the Tuesday of the *upcoming* week (menus are posted in advance).
export function getCurrentWeekTuesday(): string {
	const now = new Date(
		new Date().toLocaleString("en-US", { timeZone: BERLIN_TZ }),
	);
	const dow = now.getDay();
	const offset = dow >= 2 && dow <= 5 ? -(dow - 2) : (9 - dow) % 7;
	const tuesday = new Date(now);
	tuesday.setDate(tuesday.getDate() + offset);
	return formatDate(tuesday);
}

export function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function getCalendarWeek(dateStr: string): number {
	const date = new Date(dateStr);
	const jan1 = new Date(date.getFullYear(), 0, 1);
	const dayOfYear =
		Math.floor((date.getTime() - jan1.getTime()) / 86400000) + 1;
	return Math.ceil(dayOfYear / 7);
}

export const DAY_COLUMNS = {
	2: "tuesday",
	3: "wednesday",
	4: "thursday",
	5: "friday",
} as const;

export const DAY_NAMES_DE: Record<number, string> = {
	2: "Dienstag",
	3: "Mittwoch",
	4: "Donnerstag",
	5: "Freitag",
};

export const DAY_NAMES_EN: Record<number, string> = {
	2: "Tuesday",
	3: "Wednesday",
	4: "Thursday",
	5: "Friday",
};

const DAY_ABBREV_MAP: Record<string, number> = {
	di: 2,
	mi: 3,
	do: 4,
	fr: 5,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
};

export function parseWeekdays(input: string): string | null {
	const parts = input
		.split(/[,\s]+/)
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

	const days: number[] = [];
	for (const part of parts) {
		const num = DAY_ABBREV_MAP[part];
		if (num === undefined) return null;
		if (!days.includes(num)) days.push(num);
	}
	if (days.length === 0) return null;
	days.sort();
	return days.join(",");
}
