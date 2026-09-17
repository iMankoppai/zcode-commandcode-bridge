---
name: commandcode-quota
description: 查询 Command Code（cmdgo-bridge 账号池）的剩余额度与用量。当用户询问额度、余额、还剩多少、还剩多少 token/额度、用量、5 小时或每周窗口限制时使用。
---

运行：

```bash
python "<YOUR_HOME>/.zcode/scripts/commandcode-quota.py"
```

把输出原样展示给用户，不要改写数字或格式。脚本报错时如实转述错误并给出简短原因提示（桥接服务未运行、账号未登录、网络不通）。

> `<YOUR_HOME>` 换成你的用户目录；数据目录可用 `--data-dir` 或 `CMDGO_DATA_DIR` 指定。
