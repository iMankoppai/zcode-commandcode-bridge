---
description: 查看 Command Code 账号额度（剩余额度、5 小时/每周窗口、本期用量）
allowed-tools: Bash
---

运行下面这条命令，然后把脚本输出**原样**展示给用户（保留格式与所有数字，不要改写、不要压缩成一句话）：

```bash
python "<YOUR_HOME>/.zcode/scripts/commandcode-quota.py"
```

> 把 `<YOUR_HOME>` 换成你的用户目录（Windows 例：`C:/Users/you`）。桥的数据目录不在默认位置时追加 `--data-dir <目录>`，或设置环境变量 `CMDGO_DATA_DIR`。

如果脚本报错，把错误信息如实告诉用户，并简短提示可能原因：桥接服务（127.0.0.1:11435）未运行、账号未登录或凭据过期、或网络不通。
