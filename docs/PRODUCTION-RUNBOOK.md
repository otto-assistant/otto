# Otto Production Runbook

## Runtime model

Each tenant is an isolated `docker compose` deployment with its own:
- project mount
- memory mount
- kimaki/opencode runtime state

## Standard operations

### Start

```bash
./otto tenant up /path/to/tenant
```

### Status

```bash
./otto tenant status /path/to/tenant
```

### Logs

```bash
./otto tenant logs /path/to/tenant --follow
```

### Stop

```bash
./otto tenant down /path/to/tenant
```

## Health checks

Healthy startup logs include:
- `Using KIMAKI_BOT_TOKEN env var`
- `Connected to Discord`
- `Discord bot is running!`
- `OpenCode server ready!`

## Incident response

1. Check status and logs.
2. Verify `.env` credentials and token validity.
3. Verify bot has been added to correct guild/channel.
4. Restart tenant if needed.

## Backup guidance

Persisted tenant state lives under `memory/` and should be backed up periodically:
- `memory/kimaki`
- `memory/opencode`
- `memory/mempalace`
