import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const menus = sqliteTable("menus", {
	weekStart: text("week_start").primaryKey(),
	imageUrl: text("image_url").notNull(),
	tuesday: text(),
	wednesday: text(),
	thursday: text(),
	friday: text(),
	rawOcr: text("raw_ocr"),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const subscribers = sqliteTable("subscribers", {
	id: integer().primaryKey({ autoIncrement: true }),
	chatId: text("chat_id").notNull().unique(),
	language: text(),
	active: integer().notNull().default(1),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
