#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Command Code 额度查询（ZCode 侧）。

数据来源：本机 cmdgo-bridge 账号池里的 API key + Command Code 官方接口；
账号池不可用时回退到官方 CLI 登录态 ~/.commandcode/auth.json。
只读取凭据并从接口取数，**不打印任何密钥内容**。

用法:
    python commandcode-quota.py
    python commandcode-quota.py --data-dir /path/to/cmdgo-bridge-data
    python commandcode-quota.py --json

数据目录解析顺序:
    --data-dir  >  $CMDGO_DATA_DIR  >  ~/.cmdgo-bridge
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DEFAULT_BASE = "https://api.commandcode.ai"
STUDIO_BASE = "https://commandcode.ai"
AUTH_JSON = os.path.join(os.path.expanduser("~"), ".commandcode", "auth.json")

PLAN_NAMES = {
    "individual-go": "Go",
    "individual-goat": "GOAT",
    "individual-pro": "Pro",
    "individual-pro-v1": "Pro",
    "individual-provider": "Provider",
    "individual-max": "Max",
    "individual-ultra": "Ultra",
    "teams-pro": "Teams Pro",
}
PLAN_CREDITS = {
    "individual-go": 10.0,
    "individual-goat": 70.0,
    "individual-pro": 30.0,
    "individual-pro-v1": 80.0,
    "individual-provider": 15.0,
    "individual-max": 150.0,
    "individual-ultra": 300.0,
    "teams-pro": 40.0,
}


def parse_args(argv):
    """极简参数解析（零依赖）：--json / --data-dir DIR。"""
    want_json = False
    data_dir = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--json":
            want_json = True
        elif a == "--data-dir" and i + 1 < len(argv):
            data_dir = argv[i + 1]
            i += 1
        elif a.startswith("--data-dir="):
            data_dir = a.split("=", 1)[1]
        i += 1
    return want_json, data_dir


def resolve_data_dir(cli_dir):
    candidates = [
        cli_dir,
        os.environ.get("CMDGO_DATA_DIR"),
        os.path.join(os.path.expanduser("~"), ".cmdgo-bridge"),
    ]
    for d in candidates:
        if d and (os.path.isfile(os.path.join(d, "accounts.json")) or os.path.isfile(os.path.join(d, "credentials.json"))):
            return d
    return candidates[0] or candidates[1] or candidates[2]


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def api_get(base, key, path):
    """返回 (data, error)。error 为 None 表示成功。"""
    req = urllib.request.Request(base + path, method="GET")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "command-code/quota-script")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8", "replace")), None
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return None, "凭据无效或已过期（HTTP %d），需要重新登录" % e.code
        return None, "HTTP %d" % e.code
    except Exception as e:
        return None, "网络错误: %s" % str(e)[:120]


def money(x, digits=4):
    try:
        return "$%s" % format(float(x), ".%df" % digits)
    except Exception:
        return "$?"


def dwidth(s):
    """终端显示宽度：CJK 字符占 2 列。"""
    import unicodedata
    w = 0
    for ch in s:
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return w


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def bar(used, cap, width=20):
    try:
        ratio = min(max(float(used) / float(cap), 0.0), 1.0) if float(cap) > 0 else 0.0
    except Exception:
        return "[" + "-" * width + "]"
    filled = int(round(ratio * width))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def humanize_until(dt):
    if dt is None:
        return ""
    secs = (dt - datetime.now()).total_seconds()
    if secs <= 0:
        return "已重置"
    days = int(secs // 86400)
    hours = int((secs % 86400) // 3600)
    mins = int((secs % 3600) // 60)
    if days > 0:
        return "约 %d 天 %d 小时后" % (days, hours)
    if hours > 0:
        return "约 %d 小时 %d 分后" % (hours, mins)
    return "约 %d 分钟后" % max(mins, 1)


def tokens_short(n):
    try:
        n = float(n)
    except Exception:
        return "?"
    if n >= 1e6:
        return "%.2fM" % (n / 1e6)
    if n >= 1e3:
        return "%.1fK" % (n / 1e3)
    return "%d" % n


def collect_entries(data_dir):
    """返回 (base, [(label, key 或 None, 错误说明 或 None)])。"""
    base = DEFAULT_BASE
    entries = []
    if data_dir and os.path.isdir(data_dir):
        base = (load_json(os.path.join(data_dir, "config.json")) or {}).get("baseURL") or DEFAULT_BASE
        accounts = (load_json(os.path.join(data_dir, "accounts.json")) or {}).get("accounts") or []
        creds = load_json(os.path.join(data_dir, "credentials.json")) or {}
        for a in accounts:
            label = a.get("userName") or a.get("id") or "?"
            if a.get("enabled") is False:
                entries.append((label, None, "已在账号池中停用"))
                continue
            entry = creds.get(a.get("ref") or "")
            key = entry.get("value") if isinstance(entry, dict) else None
            entries.append((label, key, None if key else "找不到凭据（%s）" % (a.get("ref") or "?")))
    if not any(key for _, key, _ in entries):
        auth = load_json(AUTH_JSON) or {}
        key = auth.get("apiKey")
        if key:
            entries = [(auth.get("userName") or "?", key, None)]
    return base, entries


def report_account(base, name, key, quiet=False):
    emit = (lambda *a: None) if quiet else (lambda *a: print(*a))
    whoami, err1 = api_get(base, key, "/alpha/whoami?limits=1")
    credits, err2 = api_get(base, key, "/alpha/billing/credits")
    subs, err3 = api_get(base, key, "/alpha/billing/subscriptions")
    summary, err4 = api_get(base, key, "/alpha/usage/summary")

    if credits is None and subs is None:
        return None, (err2 or err3 or err1 or "未知错误")

    sub = (subs or {}).get("data") or {}
    plan_id = sub.get("planId") or ""
    plan_name = PLAN_NAMES.get(plan_id, plan_id or "未知套餐")
    status = sub.get("status") or "?"

    emit("%s  [%s 套餐 · 订阅 %s]" % (name, plan_name, status))

    if isinstance(credits, dict):
        c = credits.get("credits") or {}
        remaining = c.get("monthlyCredits")
        weekly_used = ((credits.get("windowLimits") or {}).get("weekly") or {}).get("used")
        total = PLAN_CREDITS.get(plan_id)
        if total is None and remaining is not None and isinstance(weekly_used, (int, float)):
            total = remaining + weekly_used
        if remaining is not None:
            line = "  %s %s" % (pad("月度剩余", 12), money(remaining))
            if total:
                used = total - remaining
                line += " / %s  %s" % (money(total, 2), bar(used, total))
                line += " %3.0f%%" % (100.0 * used / total)
            emit(line)

    wl = (credits or {}).get("windowLimits") or {}
    for label, key_name in (("5 小时窗口", "fiveHour"), ("每周窗口", "weekly")):
        w = wl.get(key_name) or {}
        if not w:
            continue
        used, cap = w.get("used"), w.get("cap")
        reset_ms = w.get("resetAt")
        line = "  %s %s / %s  %s" % (pad(label, 12), money(used), money(cap, 2), bar(used, cap))
        if cap:
            line += " %3.0f%%" % (100.0 * float(used) / float(cap))
        if reset_ms:
            try:
                reset = datetime.fromtimestamp(reset_ms / 1000.0)
                line += "   %s 重置（%s）" % (reset.strftime("%m-%d %H:%M"), humanize_until(reset))
            except Exception:
                pass
        if w.get("exceeded"):
            line += "  ⚠ 已超限"
        emit(line)

    if isinstance(summary, dict) and summary:
        emit(
            "  %s %s 次请求 · %s · 输入 %s / 输出 %s tokens"
            % (
                pad("本期累计", 12),
                summary.get("totalCount", "?"),
                money(summary.get("totalCost", 0)),
                tokens_short(summary.get("totalTokensIn", 0)),
                tokens_short(summary.get("totalTokensOut", 0)),
            )
        )

    if sub.get("currentPeriodStart") and sub.get("currentPeriodEnd"):
        try:
            start = datetime.fromisoformat(sub["currentPeriodStart"].replace("Z", "+00:00")).astimezone()
            end = datetime.fromisoformat(sub["currentPeriodEnd"].replace("Z", "+00:00")).astimezone()
            days = max((end - datetime.now(end.tzinfo)).days, 0)
            emit("  订阅周期    %s → %s（剩约 %d 天）" % (start.strftime("%m-%d"), end.strftime("%m-%d"), days))
        except Exception:
            pass

    uname = ((whoami or {}).get("user") or {}).get("userName")
    if uname:
        emit("  用量详情    %s/%s/settings/usage" % (STUDIO_BASE, uname))

    return {
        "account": name,
        "plan": plan_id,
        "status": status,
        "credits": (credits or {}).get("credits"),
        "windowLimits": (credits or {}).get("windowLimits"),
        "usage": summary,
    }, None


def main():
    want_json, cli_dir = parse_args(sys.argv[1:])
    data_dir = resolve_data_dir(cli_dir)
    base, entries = collect_entries(data_dir)

    if not entries:
        msg = "没有可用凭据：账号池为空（%s），也读不到 %s" % (data_dir or "未找到数据目录", AUTH_JSON)
        if want_json:
            print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False, indent=2))
        else:
            print(msg)
            print("先启动 cmdgo-bridge 并在 http://127.0.0.1:11435/ 登录一次，或用官方 CLI 执行登录。")
        return 1

    if not want_json:
        print("Command Code 额度  (数据源: %s)" % base)
        print()

    results = []
    ok = 0
    for label, key, err in entries:
        if key is None:
            if want_json:
                results.append({"account": label, "error": err})
            else:
                print("* %s  %s" % (label, err))
                print()
            continue
        result, error = report_account(base, label, key, quiet=want_json)
        if result:
            ok += 1
            results.append(result)
        else:
            if want_json:
                results.append({"account": label, "error": error})
            else:
                print("* %s  查询失败: %s" % (label, error))
        if not want_json:
            print()

    if want_json:
        print(json.dumps({"ok": ok > 0, "base": base, "results": results}, ensure_ascii=False, indent=2))
        return 0 if ok else 1

    if ok == 0:
        print("所有账号查询失败。若刚续费/重新登录过，请稍后重试。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
