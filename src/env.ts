export interface Env {
	DB: D1Database;
	AI: Ai;
	NOTIFICATION_QUEUE: Queue<NotificationMessage>;
	MENU_IMAGES: R2Bucket;
	TELEGRAM_BOT_TOKEN: string;
	BOT_USERNAME: string;
	DEEPL_API_KEY: string;
	R2_PUBLIC_BASE_URL: string;
}

export interface NotificationMessage {
	chatId: string;
	text: string;
	imageUrls?: string[];
}
