# ZCode 额度查询（三件套）

和桥搭配使用的额度查询：打印剩余 credits、5 小时/每周限流窗口（含进度条与重置倒计时）、本期请求数与 token 累计、订阅周期。

| 文件 | 部署到 | 作用 |
| --- | --- | --- |
| `commandcode-quota.py` | `~/.zcode/scripts/` | 脚本本体（零依赖，只用标准库） |
| `quota.md` | `~/.zcode/commands/` | `/quota` 命令：让 agent 跑脚本并把输出原样贴出来 |
| `SKILL.md` | `~/.zcode/skills/commandcode-quota/` | 自然语言触发（"查额度""还剩多少"） |
| `install-quota.cmd` | —（就地运行） | 一键安装：拷三个文件 + 自动把 `<YOUR_HOME>` 替换成你的用户目录 |
| `replace-placeholder.ps1` | —（被上面调用） | 替换占位符；写 UTF-8 **不带 BOM**，否则 ZCode 的 frontmatter 会解析失败 |

## 部署（一键）

```bat
:: 在仓库的 quota\ 目录里双击，或：
install-quota.cmd
```

它会：建好 `~/.zcode/{scripts,commands,skills/commandcode-quota}` → 拷三个文件 → 把两个 `.md` 里的 `<YOUR_HOME>` 换成 `C:/Users/<你>` → 打印下一步。重复运行安全（第二次会报 `already patched`）。

> ZCode **在启动时加载命令与技能列表**：装完**新开一个对话**，`/quota` 才会出现；仍不生效则重启 ZCode。

### 手工部署（不想用脚本时）

```bat
mkdir "%USERPROFILE%\.zcode\scripts" "%USERPROFILE%\.zcode\commands" "%USERPROFILE%\.zcode\skills\commandcode-quota"
copy /y commandcode-quota.py "%USERPROFILE%\.zcode\scripts\"
copy /y quota.md             "%USERPROFILE%\.zcode\commands\"
copy /y SKILL.md             "%USERPROFILE%\.zcode\skills\commandcode-quota\"
:: 然后把两个 .md 里的 <YOUR_HOME> 手工改成你的用户目录（正斜杠，如 C:/Users/you）
:: 注意用不带 BOM 的 UTF-8 保存，否则 YAML frontmatter 可能解析失败
```

## 用法

```bash
python commandcode-quota.py                 # 人读卡片
python commandcode-quota.py --json          # 机器可读（纯 JSON）
python commandcode-quota.py --data-dir DIR  # 指定桥的数据目录
```

数据目录解析顺序：`--data-dir` → `$CMDGO_DATA_DIR` → `~/.cmdgo-bridge`；账号池为空时回退到官方 CLI 登录态 `~/.commandcode/auth.json`，所以单独装 ZCode 也能用。

## 说明

- **只读**：脚本只读取账号池凭据并调用 Command Code 接口（`/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary`），**不打印任何密钥内容**，也不会修改任何文件。
- **账号级口径**：额度是账号级的，所以桥的 key 与 `auth.json` 的 key 查到的是同一份数字（同一账号时完全一致）。
- **与 DSH 侧的关系**：DSH 那边有一份等价的 Node 实现（见姊妹仓库 `dsh-commandcode-integration` 的 `skills/commandcode-quota/`）。两边是不同客户端的各自实现：ZCode 用 Python（本目录），DSH 用 Node。同一台机器上两者读同一份数据源，数字一致。
