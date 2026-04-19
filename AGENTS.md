# Agents / Development Notes

Learnings and decisions from building this project.

## Cloudflare Workers AI — Vision Model Selection

We tested every vision-capable model on Workers AI. Results:

| Model | Works? | Notes |
|-------|--------|-------|
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | **Yes** | Only model that reliably returns structured JSON from menu images |
| `@cf/google/gemma-4-26b-a4b-it` | No | Returns empty responses for all image input formats (top-level `image` field and `image_url` in messages content array). Both base64 data URIs and raw URL approaches fail silently — no error, just empty `response` field. Tested April 2026. |
| `@cf/meta/llama-3.2-11b-vision-instruct` | No | Requires license agreement prompt. Explicitly blocked for EU users ("you represent that you are not an individual domiciled in... the European Union"). |
| `@cf/llava-hf/llava-1.5-7b-hf` | Untested | Beta, 7B params — likely too small for reliable structured extraction from German menu images. |

### Image Input Format

Workers AI does **not** fetch external image URLs. You must:
1. Download the image in the worker (`fetch`)
2. Convert to base64 (`arrayBufferToBase64`)
3. Pass as a data URI: `data:image/png;base64,...`
4. Use the OpenAI-compatible messages format:
   ```json
   {
     "messages": [{
       "role": "user",
       "content": [
         { "type": "text", "text": "..." },
         { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
       ]
     }]
   }
   ```

The top-level `image` field (from the Llama tutorial) did not work for Mistral or Gemma 4.

### Performance

The Mistral Small 3.1 vision call takes ~30-60 seconds for a ~900KB PNG. This is within Workers' CPU time limits but close. If images grow significantly larger, consider resizing before sending.

## Scraper

The menu image comes from the shop's Facebook page (`facebook.com/MetzgereiVoelp`) via an [RSS.app](https://rss.app) JSON feed. We tried their WordPress page first (`/aktuelles/`) but the image there is often outdated; the Facebook feed is kept more current.

Facebook itself cannot be scraped directly — it blocks unauthenticated access and uses obfuscated markup. RSS.app handles that and exposes a stable JSON feed. We pick the most recent item with an image and empty `content_text` (menu posts have no caption; text posts are news/announcements).

If the Facebook feed approach breaks, the WordPress fallback logic could be restored from git history.

## Menu Data Storage

Meals are stored as JSON arrays in text columns (e.g., `["Backfisch...", "Porchetta..."]`). The `parseMealItems()` helper handles both:
- New format: JSON arrays
- Legacy format: plain strings (treated as single-item arrays)

No schema migration was needed for the multi-item support.

## Telegram Bot

- Bot responds in the user's language (detected from `from.language_code` in the update)
- Commands must be registered via the Bot API `setMyCommands` for autocomplete to work
- Using `<pre>` blocks causes day names to render as links in Telegram — use `<b>` for headers and bullet points for items instead
- The bot profile photo must be set manually via @BotFather (`/setuserpic`)

## Deployment

- Auto-deploy is connected via GitHub repo integration in the Cloudflare dashboard
- Deploys take under a minute after push
- D1 migrations must be applied before the worker deploy (`npm run deploy` handles both)
- The `wrangler deploy` CLI can time out on slow connections — the GitHub auto-deploy is more reliable

## Environment

- `TELEGRAM_BOT_TOKEN` — stored as a Cloudflare secret
- `BOT_USERNAME` — stored as a plain var in `wrangler.toml` (used for the t.me link on the static site)
- `DB`, `AI`, `NOTIFICATION_QUEUE` — Cloudflare bindings configured in `wrangler.toml`
