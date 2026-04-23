# Otto Production Quickstart

## 1) Install zero-local wrapper

Download the `otto` wrapper script and make it executable:

```bash
curl -fsSL https://raw.githubusercontent.com/otto-assistant/otto/master/otto -o otto
chmod +x otto
```

Set image channel (optional):

```bash
export OTTO_IMAGE=ghcr.io/otto-assistant/otto:stable   # or :edge
```

## 2) Initialize tenant

```bash
./otto tenant init /opt/otto-tenants/my-bot
```

This creates:
- `compose.yml`
- `.env`
- `projects/`
- `memory/` with `AGENTS.md`, `soul.md`, `persona.md`, `mempalace/`, `kimaki/`, `opencode/`

## 3) Configure credentials

Edit `/opt/otto-tenants/my-bot/.env`:

```env
KIMAKI_BOT_TOKEN=...
GOOGLE_API_KEY=...   # or OPENAI_API_KEY / ANTHROPIC_API_KEY
OTTO_MODE=safe
```

## 4) Start tenant

```bash
./otto tenant up /opt/otto-tenants/my-bot
./otto tenant status /opt/otto-tenants/my-bot
./otto tenant logs /opt/otto-tenants/my-bot
```

## 5) Install baseline skills (recommended)

```bash
./otto tenant skills bootstrap /opt/otto-tenants/my-bot
```

## 6) Stop tenant

```bash
./otto tenant down /opt/otto-tenants/my-bot
```
