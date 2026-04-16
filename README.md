# Voelpping

A Cloudflare Workers service that scrapes the weekly lunch menu ("Mittagstisch") from [Metzgerei Völp](https://metzgerei-voelp.de/aktuelles/) and delivers daily Telegram notifications to subscribers.

**Live:** [voelp.jonas-strassel.de](https://voelp.jonas-strassel.de) | **Bot:** [@voelp_bot](https://t.me/voelp_bot)

## Features

- **Automatic menu detection** — daily cron scrapes the website for new menu images
- **AI-powered OCR** — extracts meals per day from the menu image using Cloudflare Workers AI (Mistral Small 3.1)
- **Multiple items per day** — correctly handles days with more than one meal option
- **Telegram bot** — subscribe, set preferred days, view the current menu (bilingual DE/EN)
- **Static website** — bilingual page with dark/light mode, current menu, and subscribe link
- **Historical data** — all menus stored permanently for future statistics

## Architecture

- **Cloudflare Workers** — single worker handling webhooks, cron, and queue processing
- **D1** — SQLite database for menus and subscribers (Drizzle ORM)
- **Cloudflare Queue** — notification fan-out with automatic retries
- **Workers AI** — `@cf/mistralai/mistral-small-3.1-24b-instruct` for vision/OCR

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

# Register Telegram webhook and commands
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/webhook/<TOKEN>"
curl "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "content-type: application/json" \
  -d '{"commands":[
    {"command":"menu","description":"Aktuelle Wochenkarte / Current weekly menu"},
    {"command":"subscribe","description":"Benachrichtigungen aktivieren / Subscribe"},
    {"command":"unsubscribe","description":"Abmelden / Unsubscribe"},
    {"command":"setday","description":"Tage wählen / Set notification days"}
  ]}'
```

### Manual Trigger

```bash
# Scrape and notify
curl "https://<DOMAIN>/trigger/<TOKEN>"

# Force re-extraction (deletes current week's data first)
curl "https://<DOMAIN>/trigger/<TOKEN>?force"
```

## Cron Schedule

A single cron runs daily at 09:00 CEST (`0 7 * * *` UTC):

1. Checks the website for a new menu image (compares URL against stored value)
2. If new, runs OCR and stores the extracted meals as JSON arrays
3. On Tue–Fri, enqueues notifications to subscribers via the queue
