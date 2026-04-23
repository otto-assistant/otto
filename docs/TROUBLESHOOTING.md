# Otto Troubleshooting

## Bot added but no responses

Checklist:
1. Tenant is up:
   - `./otto tenant status <path>`
2. Logs show ready state:
   - `./otto tenant logs <path>`
   - look for `Discord bot is running!`
3. Token configured in `.env`:
   - `KIMAKI_BOT_TOKEN=...`
4. Provider key configured:
   - one of `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
5. Bot has required Discord intents/permissions.
6. You are posting in the channel/thread managed by this tenant.

## Restart loop on startup

Check logs first:

```bash
./otto tenant logs <path>
```

Common causes:
- missing/invalid `KIMAKI_BOT_TOKEN`
- invalid provider API key
- bot not in any guild/channel

## `Setup requires interactive terminal (TTY)` in logs

Root cause: container was not using `KIMAKI_BOT_TOKEN` env var.

Fix:
- set `KIMAKI_BOT_TOKEN` in tenant `.env`
- restart tenant

## Bridge/opencode state resets between restarts

Ensure compose includes bind mounts:
- `./memory/kimaki:/root/.kimaki`
- `./memory/opencode:/root/.config/opencode`

## Skills missing in tenant

Run baseline bootstrap:

```bash
./otto tenant skills bootstrap <path>
```
