# cmdgo-zcode — Command Code Go plan inside ZCode (Windows)

**中文** | [English](README.en.md) · [![ci](https://github.com/iMankoppai/zcode-commandcode-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/iMankoppai/zcode-commandcode-bridge/actions/workflows/ci.yml)

> Unofficial integration. You need your own Command Code subscription; Command Code's terms apply. Neither the upstream bridge nor this repo is affiliated with Command Code, Inc.

## The problem it solves

Command Code subscriptions come in two flavours:

| Subscription | API surface you get |
| --- | --- |
| GOAT / Pro / Provider | The standard Provider API (`/provider/v1`, OpenAI-compatible) — any client can connect directly |
| **Go ($1/mo)** | **Only the CLI-private gateway `POST /alpha/generate`**; the official OpenAI endpoints answer `403 upgrade_required` |

ZCode speaks exactly two protocols, `anthropic` and `openai-compatible`, and **cannot speak `/alpha/generate`**. So something has to translate. This repo uses the upstream [cmdgo-bridge](https://github.com/Patrick-mufeng/cmdgo-bridge) as that translator and adds the glue that registers it in ZCode:

```
ZCode ──(OpenAI-compatible)──► cmdgo-bridge 127.0.0.1:11435 ──(/alpha/generate + OAuth account pool)──► Command Code Go
                                    ▲
                     this repo: start / supervise / autostart,
                     ZCode provider registration, upstream patch
```

## What's in here

| File | Purpose |
| --- | --- |
| `zcode-commandcode-setup.mjs` | Registers the bridge as a ZCode `openai-compatible` provider (preview by default; `--apply` writes and backs up; `--remove --apply` uninstalls) |
| `zcode-provider.example.json` | The provider shape written into `~/.zcode/v2/config.json` (placeholder key) |
| `bridge-run-hidden.vbs` | Starts the bridge with no visible window (drop it in `shell:startup` for autostart) |
| `bridge-loop.cmd` | Supervisor loop: restarts the bridge 5 s after it exits; **does nothing while an instance is already listening** (no port fights) |
| `start-bridge.cmd` / `status.cmd` / `stop-bridge.cmd` | Visible start (live logs) / health + account pool / stop everything |
| `patches/` | Upstream patch clamping `max_tokens` to the 200000 the Go gateway allows (**without it a batch of models fails with 400** — see `patches/README.md`) |
| `quota/` | ZCode-side quota toolkit: the script plus a `/quota` command and a natural-language skill (see `quota/README.md`) |
| `scripts/check-static.mjs` | Zero-dependency static checks run by CI (see `.github/workflows/ci.yml`) |

## Requirements

- Windows 10/11
- **Node.js ≥ 20.3** (required by the upstream bridge; the scripts here need it too)
- A Command Code **Go plan** account (one browser OAuth approval)
- ZCode installed and **started at least once** (so `~/.zcode/v2/config.json` exists)

## Install

```bat
:: 1) fetch and build the upstream bridge
git clone https://github.com/Patrick-mufeng/cmdgo-bridge.git cmdgo-bridge
cd cmdgo-bridge
npm install && npm run build
cd ..

:: 2) apply this repo's patch (strongly recommended)
git -C cmdgo-bridge apply ..\patches\cmdgo-bridge-max-tokens.patch
::    rebuild afterwards: cd cmdgo-bridge && npm run build && cd ..

:: 3) first run (visible window: live logs + the client API key it prints)
start-bridge.cmd

:: 4) open the console and complete the OAuth login
::    http://127.0.0.1:11435/
::    the account lands in the pool; note the client API key shown in CONFIG

:: 5) register it in ZCode (preview first, then --apply)
node zcode-commandcode-setup.mjs
node zcode-commandcode-setup.mjs --apply

:: 6) fully quit and restart ZCode - "CommandCode Go" appears in the model picker
```

## Keeping it running

- **Manually**: double-click `bridge-run-hidden.vbs` (no window appears — that is expected)
- **At logon**: copy/shortcut `bridge-run-hidden.vbs` into `shell:startup` (Win+R → `shell:startup`)
- **Supervision**: `bridge-loop.cmd` restarts the bridge 5 s after it exits; double-clicking again will not start a second instance (it just idles while the port is held)
- **Stop**: `stop-bridge.cmd` (also ends the supervisor loop)
- The bridge's stdout and `supervisor.log` are your first-class diagnostics

## Verify

```bat
status.cmd
:: expect: ok=true, models=43, accounts>=1, account cooling=false

curl http://127.0.0.1:11435/v1/chat/completions ^
  -H "Authorization: Bearer <bridge client key>" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"deepseek/deepseek-v4-flash\",\"max_tokens\":64,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}"
```

## Quota lookup (`/quota` command + natural language)

`quota/` is a three-piece ZCode-side quota toolkit: remaining credits, the 5-hour / weekly rate windows (with bars and reset countdowns), the period request and token totals, and the subscription period.

| File | Deploy to | Purpose |
| --- | --- | --- |
| `quota/commandcode-quota.py` | `~/.zcode/scripts/` | The script (standard library only, no dependencies) |
| `quota/quota.md` | `~/.zcode/commands/` | The `/quota` command: run the script and show its output verbatim |
| `quota/SKILL.md` | `~/.zcode/skills/commandcode-quota/` | Natural-language trigger ("check the quota") |

Deployment steps: [`quota/README.md`](quota/README.md). Key points: the script is **read-only** and **never prints a secret**; the data dir resolves as `--data-dir` → `$CMDGO_DATA_DIR` → `~/.cmdgo-bridge`, falling back to `~/.commandcode/auth.json` when the pool is empty; ZCode loads commands and skills **at startup**, so open a new conversation before expecting `/quota` to appear.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Some models return 400 `Too big: expected number to be <=200000` | The upstream patch is missing (or you did not rebuild after applying). See `patches/README.md` |
| Every request 400/403 `upgrade_required` | The account is not on the Go plan, or the credential is stale → log in again from the console |
| `MISSING_CREDENTIAL` | OAuth login was never completed (console → "发起登录") |
| Empty model list in ZCode | Expected with no credential; make sure `~/.zcode/v2/config.json` has baseURL `http://127.0.0.1:11435/v1`, then fully restart ZCode |
| ZCode times out on everything | The bridge is not running (closing its window stops it) → double-click `bridge-run-hidden.vbs` |
| Port already in use | `stop-bridge.cmd`, then retry; or set `CMDGO_PORT` (and update the ZCode provider baseURL) |
| HTTP 200 but empty content | A thinking model spent the whole `max_tokens` on reasoning (`finish_reason=length`) → raise `max_tokens` |

## Rotating a key / adding accounts

The bridge keeps an account pool (per-request round-robin with failure cooldown). Each completed console login **adds** an account; **a new login does not replace the old key**. To retire an old key:

1. Disable/remove the old account in the console (this deletes its key from the local `cmdgo-bridge-data\credentials.json`);
2. Delete the matching `cli-…` key on the Command Code website (Settings → Keys) so it dies server-side too.

## Privacy and credentials

This repo contains **no secrets**, but a local deployment produces sensitive files — never commit them:

| Path | Contents |
| --- | --- |
| `cmdgo-bridge-data\credentials.json` | Command Code **API key (plaintext)** |
| `cmdgo-bridge-data\config.json` | the bridge's client token (ZCode's config uses it too) |
| `cmdgo-bridge-data\accounts.json` | account pool metadata |
| `~/.zcode/v2/config.json` | contains the bridge client token |

`.gitignore` excludes them. Also: **an API key that ever appeared in a log or transcript should be rotated** (log in again from the console + delete the old key on the website).

## Compatibility notes

- The bridge depends on upstream's implementation of Command Code's private gateway (`CC_VERSION` constant, request fingerprinting). If Command Code changes the gateway while upstream stays stale, the bridge starts failing — update upstream or adjust that constant.
- ZCode providers use `kind: "openai-compatible"`; if a future ZCode changes the provider schema, the setup script's output needs adjusting.

## License and credits

MIT for the code in this repo (see `LICENSE`). The bridge itself is third-party: **Patrick-mufeng/cmdgo-bridge (MIT)** — this repo ships only a patch and integration scripts, not a copy of its source.
