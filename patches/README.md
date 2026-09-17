# 本地补丁

## `cmdgo-bridge-max-tokens.patch`

**针对上游**：[Patrick-mufeng/cmdgo-bridge](https://github.com/Patrick-mufeng/cmdgo-bridge)（MIT）
**基线**：commit `4c5d4fe`（2026-09-01）

### 它修什么

Command Code **Go 网关**对 `params.max_tokens` 有一个**全局硬上限 200000**（任何模型都一样），超过就返回：

```
400 Invalid request error … Validation error: Too big: expected number to be <=200000 at "params.max_tokens"
```

上游的桥只在这个字段**缺失**时回退到默认值（64k），**不会钳制客户端传入的值**，于是：

1. 客户端（例如 ZCode）把模型声明的输出上限原样当 `max_tokens` 发出去；
2. 社区规则表里 `deepseek/deepseek-v4` = 384000、`xai/grok` = 500000、`Kimi-K2.7-Code` = 262144 —— 全都超过 200000；
3. 这些模型**一发起请求就被网关拒掉**（生成还没开始），表现为"模型不可用 / Invalid request error"。

### 补丁内容（一行逻辑）

```diff
+export const GATEWAY_MAX_TOKENS = 200_000
...
-    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
+    max_tokens: Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, GATEWAY_MAX_TOKENS),
```

### 怎么用

```sh
git clone https://github.com/Patrick-mufeng/cmdgo-bridge.git
cd cmdgo-bridge
git apply /path/to/cmdgo-bridge-max-tokens.patch
npm install && npm run build
```

`git apply` 失败（上游改动过这段）时用 `git apply -3` 三方合并，或直接手工把上面那两处改掉——逻辑只有一行。

### 注意

- 上游若将来自己加上钳制，本补丁即可弃用（症状消失）；
- 补丁不改变任何其他行为：未传 `max_tokens` 时仍然回退 64000。
