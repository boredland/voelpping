export interface Env {
	DB: D1Database;
	AI: Ai;
	NOTIFICATION_QUEUE: Queue<NotificationMessage>;
	TELEGRAM_BOT_TOKEN: string;
	BOT_USERNAME: string;
}

export interface NotificationMessage {
	chatId: string;
	text: string;
}
