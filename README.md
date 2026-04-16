# Voelpping

A Cloudflare Workers service that scrapes the weekly lunch menu ("Mittagstisch") from [Metzgerei Völp](https://metzgerei-voelp.de/aktuelles/) and delivers daily Telegram notifications to subscribers.

## Features

- **Automatic menu detection** — daily cron scrapes the website for new menu images
- **AI-powered OCR** — extracts meals per day from the menu image using Cloudflare Workers AI (Gemma 4)
- **Telegram bot** — subscribe, set preferred days, view the current menu
- **Static website** — bilingual (DE/EN) page showing the current menu and a subscribe link
- **Historical data** — all menus are stored permanently for future statistics

## Architecture

- **Cloudflare Workers** — single worker handling webhooks, cron, and queue processing
- **D1** — SQLite database for menus and subscribers
- **Cloudflare Queue** — notification fan-out with automatic retries
- **Workers AI** — `@cf/google/gemma-4-26b-a4b-it` for image-to-text extraction

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Subscribe to daily notifications |
| `/menu` | Show this week's menu |
| `/setday Di,Do` | Only get notified on specific days (Di, Mi, Do, Fr) |
| `/unsubscribe` | Stop notifications |

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- A Cloudflare account
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Local Development

```bash
# Install dependencies
npm install

# Set up local environment
cp .dev.vars.example .dev.vars  # edit with your Telegram bot token

# Create local D1 database and apply migrations
npm run db:migrate:local

# Start dev server
npm run dev
```

### Deployment

```bash
# Create D1 database
wrangler d1 create voelpping
# → Copy the database_id into wrangler.toml

# Create the notification queue
wrangler queues create voelpping-notifications

# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN

# Apply migrations and deploy
npm run deploy

# Register the Telegram webhook
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://voelpping.<subdomain>.workers.dev/webhook/<TOKEN>"
```

## Cron Schedule

A single cron runs daily at 09:00 CEST (`0 7 * * *` UTC):

1. Checks the website for a new menu image
2. If found, runs OCR and stores the extracted meals
3. On Tue–Fri, enqueues notifications to subscribers via the queue
