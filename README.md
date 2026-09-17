# cmdgo-zcode — 把 Command Code Go 套餐接进 ZCode（Windows）

[English](README.en.md) | **中文** · [![ci](https://github.com/iMankoppai/zcode-commandcode-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/iMankoppai/zcode-commandcode-bridge/actions/workflows/ci.yml)

**English TL;DR** — A tiny Windows toolkit that puts a local `cmdgo-bridge` (Command Code **Go plan** → OpenAI-compatible API) in front of ZCode, registers it as an `openai-compatible` provider, keeps it running (hidden autostart + supervisor loop), and ships the one-line upstream patch the Go gateway needs.

> 非官方整合。需要你自己的 Command Code 订阅，适用 Command Code 的服务条款。上游桥与本仓库均与 Command Code, Inc. 无关。

---

## 它解决什么问题

Command Code 的订阅分两类：

| 订阅 | 可用的 API 形态 |
| --- | --- |
| GOAT / Pro / Provider | 标准 Provider API（`/provider/v1`，OpenAI 兼容），任何客户端可直连 |
| **Go（$1/月）** | **只能用 CLI 私有网关 `POST /alpha/generate`**；调官方 OpenAI 端点会拿到 `403 upgrade_required` |

ZCode 只会说 `anthropic` / `openai-compatible` 两种协议，**没法直接说 `/alpha/generate`**。所以中间必须有一层翻译：本仓库用上游 [cmdgo-bridge](https://github.com/Patrick-mufeng/cmdgo-bridge) 做这层桥，再由本仓库的脚本把它注册进 ZCode。

```
ZCode ──(OpenAI 兼容)──► cmdgo-bridge 127.0.0.1:11435 ──(/alpha/generate + OAuth 账号池)──► Command Code Go
                              ▲
                        本仓库负责：启动/守护/自启、ZCode provider 注册、上游补丁
```

## 目录内容

| 文件 | 作用 |
| --- | --- |
| `zcode-commandcode-setup.mjs` | 把桥注册成 ZCode 的 `openai-compatible` provider（默认**只预览**，`--apply` 才写盘并备份；`--remove --apply` 卸载） |
| `zcode-provider.example.json` | 写进 `~/.zcode/v2/config.json` 的 provider 结构示例（含占位 key） |
| `bridge-run-hidden.vbs` | 无窗口启动桥（放进 `shell:startup` 即开机自启） |
| `bridge-loop.cmd` | 守护循环：进程退出 5 秒后重拉；**已有实例在跑就不重复启动**（避免抢端口） |
| `start-bridge.cmd` / `status.cmd` / `stop-bridge.cmd` | 有窗口启动（看日志）/ 查看健康与账号池 / 停止 |
| `patches/` | 上游补丁：把 `max_tokens` 钳到 Go 网关允许的 200000 以内（**不装会有一批模型直接 400**，见 `patches/README.md`） |
| `quota/` | ZCode 侧额度查询三件套：脚本本体 + `/quota` 命令 + 自然语言技能（见 `quota/README.md`） |

## 前置条件

- Windows 10/11
- **Node.js ≥ 20.3**（上游桥要求；本仓库脚本亦需）
- 一个 Command Code **Go 套餐**账号（浏览器完成一次 OAuth 授权）
- ZCode 已安装并**至少启动过一次**（这样 `~/.zcode/v2/config.json` 才存在）

## 安装

```bat
:: 1) 取上游桥并构建
git clone https://github.com/Patrick-mufeng/cmdgo-bridge.git cmdgo-bridge
cd cmdgo-bridge
npm install && npm run build
cd ..

:: 2) 打上本仓库的补丁（强烈建议）
git -C cmdgo-bridge apply ..\patches\cmdgo-bridge-max-tokens.patch
::    改完要重新构建：cd cmdgo-bridge && npm run build && cd ..

:: 3) 先跑一次（有窗口，能看到日志和它打印的客户端 API key）
start-bridge.cmd

:: 4) 浏览器打开控制台，点「发起登录」完成 OAuth
::    http://127.0.0.1:11435/
::    授权成功后账号进入账号池，桥开始可用；顺手记下控制台里的客户端 API key

:: 5) 注册进 ZCode（先预览，确认无误再 --apply）
node zcode-commandcode-setup.mjs
node zcode-commandcode-setup.mjs --apply

:: 6) 完全退出并重启 ZCode（要退干净），模型选择器里出现 CommandCode Go
```

## 常驻运行

- **手动**：双击 `bridge-run-hidden.vbs`（无窗口，属正常）
- **开机自启**：把 `bridge-run-hidden.vbs` 的副本/快捷方式放进 `shell:startup`
  （Win+R 输入 `shell:startup` 打开该目录）
- **守护**：`bridge-loop.cmd` 会在桥退出后 5 秒重拉；重复双击不会双开（检测到端口已在监听就只空转等待）
- **停止**：`stop-bridge.cmd`（连守护循环一起结束）
- 桥的 stdout 与 `supervisor.log` 是排查问题的第一手材料

## 验证

```bat
status.cmd
:: 期望：ok=true、models=43、accounts≥1、账号 cooling=false

curl http://127.0.0.1:11435/v1/chat/completions ^
  -H "Authorization: Bearer <桥的客户端 key>" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"deepseek/deepseek-v4-flash\",\"max_tokens\":64,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}"
```

## 额度查询（`/quota` 命令 + 自然语言）

`quota/` 是一套 ZCode 侧额度查询三件套：打印剩余 credits、5 小时/每周窗口（含进度条与重置倒计时）、本期请求数与 token 累计、订阅周期。

| 文件 | 部署到 | 作用 |
| --- | --- | --- |
| `quota/commandcode-quota.py` | `~/.zcode/scripts/` | 脚本本体（只用标准库，零依赖） |
| `quota/quota.md` | `~/.zcode/commands/` | `/quota` 命令：跑脚本并把输出原样贴出 |
| `quota/SKILL.md` | `~/.zcode/skills/commandcode-quota/` | 自然语言触发（"查额度""还剩多少"） |

部署步骤见 [`quota/README.md`](quota/README.md)。要点：脚本**只读**凭据、**不打印任何密钥**；数据目录按 `--data-dir` → `$CMDGO_DATA_DIR` → `~/.cmdgo-bridge` 解析，账号池为空时回退到 `~/.commandcode/auth.json`；ZCode 在**启动时**加载命令与技能列表，装完新开一个对话 `/quota` 才会出现。

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 部分模型 400 `Too big: expected number to be <=200000` | 上游补丁没打（或没重新 `npm run build`）。见 `patches/README.md` |
| 全部请求 400/403 `upgrade_required` | 该账号不是 Go 套餐，或凭据失效 → 控制台重新登录 |
| 请求报 `MISSING_CREDENTIAL` | 还没完成 OAuth 登录（控制台「发起登录」） |
| ZCode 里模型列表为空 | 未配置凭据时为空属预期；确认 `~/.zcode/v2/config.json` 里 baseURL 是 `http://127.0.0.1:11435/v1`，然后完全重启 ZCode |
| ZCode 全部报连接超时 | 桥没在跑（关窗即停）→ 重新双击 `bridge-run-hidden.vbs` |
| 端口被占用 | `stop-bridge.cmd` 后重试；或设 `CMDGO_PORT` 换端口（脚本与 ZCode provider 的 baseURL 都要改） |
| 回复内容为空但 HTTP 200 | 思考型模型把 `max_tokens` 全用在 reasoning 上了（`finish_reason=length`）→ 调大 `max_tokens` |

## 换 key / 加账号

桥支持账号池（请求级 round-robin + 失败冷却）。控制台「发起登录」每完成一次就**新增**一个账号；**新登录不会自动替换旧 key**，要退休旧 key 需两步：

1. 控制台里把旧账号停用/移除（本机 `cmdgo-bridge-data\credentials.json` 里的那把 key 随之删除）；
2. 到 Command Code 官网 Settings → Keys 删除对应的 `cli-…` key（官方侧作废）。

## 隐私与凭据（重要）

本仓库**不含任何密钥**，但你的本地部署会产生敏感文件，请勿提交：

| 路径 | 内容 |
| --- | --- |
| `cmdgo-bridge-data\credentials.json` | Command Code **API key（明文）** |
| `cmdgo-bridge-data\config.json` | 桥的客户端 token（ZCode 配置里也用它） |
| `cmdgo-bridge-data\accounts.json` | 账号池元数据 |
| `~/.zcode/v2/config.json` | 含桥的客户端 token |

`.gitignore` 已把这些排除；另外注意：**API key 一旦出现在任何日志/会话记录里就该轮换**（控制台重新登录 + 官网删除旧 key）。

## 兼容性说明

- 桥依赖上游对 Command Code 私有网关的协议实现（`CC_VERSION` 常量、请求指纹）。上游若长期不更新而 Command Code 改了网关，桥会开始报错——届时更新上游或调整该常量。
- ZCode provider 使用 `kind: "openai-compatible"`：字段结构对齐社区惯例，ZCode 版本升级后若改了 provider schema，需要同步调整。

## 许可与致谢

本仓库代码 MIT（见 `LICENSE`）。桥本体是第三方项目：**Patrick-mufeng/cmdgo-bridge（MIT）**，本仓库只提供补丁与整合脚本，不复制其源码。
