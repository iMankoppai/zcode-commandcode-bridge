/**
 * Register a local cmdgo-bridge (Command Code Go -> OpenAI-compatible API) as a
 * provider inside ZCode.
 *
 *   node zcode-commandcode-setup.mjs                 # preview only (writes ./zcode-config-preview.json)
 *   node zcode-commandcode-setup.mjs --apply         # write ~/.zcode/v2/config.json (backup first)
 *   node zcode-commandcode-setup.mjs --remove --apply
 *
 * Shape follows the community convention for ZCode providers:
 *   provider.kind = "openai-compatible", options = {apiKey, apiKeyRequired, baseURL},
 *   plus per-model limit / modalities / reasoning metadata.
 * Only the one provider key is touched; every other key in the file is preserved.
 *
 * Environment:
 *   CMDGO_DATA_DIR  bridge data dir (default: ./cmdgo-bridge-data next to this file)
 *   CMDGO_PORT      bridge port   (default: 11435)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');

const PORT = process.env.CMDGO_PORT || '11435';
const BASE_URL = `http://127.0.0.1:${PORT}/v1`;
const BRIDGE_DATA = process.env.CMDGO_DATA_DIR || path.join(HERE, 'cmdgo-bridge-data');
const BRIDGE_CONFIG = path.join(BRIDGE_DATA, 'config.json');
const PREVIEW = path.join(HERE, 'zcode-config-preview.json');
const CONFIG_PATH = path.join(os.homedir(), '.zcode', 'v2', 'config.json');
const UPSTREAM_MODELS = 'https://api.commandcode.ai/provider/v1/models';
const PROVIDER_NAME = 'CommandCode Go';

// ---------- metadata rules ----------
// Command Code publishes no machine-readable output/effort data; these are the
// measured defaults the community converged on. GATEWAY_MAX_OUTPUT is a hard
// limit: the Go gateway rejects params.max_tokens > 200000.
const DEFAULT_OUTPUT = 65536;
const GATEWAY_MAX_OUTPUT = 200000;
const OUTPUT_RULES = [
  [/deepseek\/deepseek-v4/, 384000],
  [/xai\/grok/, 500000],
  [/Kimi-K2\.7-Code/, 262144],
  [/Kimi-K3/, 131072],
  [/Kimi-K2\.[56]/, 65536],
  [/GLM-5\.3/, 128000],
  [/GLM-5\.2/, 131072],
  [/zai-org\/GLM-5(\.1)?$/, 64000],
  [/gpt-5\.6/, 128000],
  [/tencent\/hy/, 64000],
  [/mimo-v2\.5/, 128000],
  [/MiniMax-M3|minimax-m3/, 131072],
  [/m2\.7|M2\.7/, 131072],
  [/MiniMax-M2\.5/, 65536],
  [/Qwen\/Qwen3\.8/, 131072],
];
const R = (variants, def) => ({ variants, defaultVariant: def });
const REASONING_RULES = [
  [/deepseek\/deepseek-v4/, R(['off', 'high', 'max'], 'max')],
  [/glm-5\.3-flash/, R(['off', 'high', 'max'], 'off')],
  [/GLM-5\.3/, R(['low', 'high', 'max'], 'max')],
  [/GLM-5\.2/, R(['off', 'high', 'max'], 'max')],
  [/zai-org\/GLM-5(\.1)?$/, R(['off', 'enabled'], 'enabled')],
  [/Kimi-K3/, R(['off', 'high', 'max'], 'max')],
  [/Kimi-K2\.[56]/, R(['off', 'enabled'], 'enabled')],
  [/Qwen\//, R(['off', 'enabled'], 'enabled')],
  [/MiniMax-M3|minimax-m3/, R(['off', 'enabled'], 'enabled')],
  [/mimo-v2\.5/, R(['off', 'enabled'], 'enabled')],
  [/tencent\/hy/, R(['off', 'high'], 'high')],
  [/xai\/grok/, R(['off', 'high'], 'high')],
  [/gpt-5\.6/, R(['off', 'high', 'max'], 'max')],
];
const INPUT_RULES = [
  [/flash-vision-exp/, ['text', 'image']],
  [/moonshotai\//, ['text', 'image', 'video']],
  [/Qwen\//, ['text', 'image', 'video']],
  [/MiniMax-M3|minimax-m3/, ['text', 'image', 'video']],
  [/mimo-v2\.5$/, ['text', 'image', 'audio', 'video']],
  [/xai\/grok/, ['text', 'image']],
  [/gpt-5\.6|google\/gemini/, ['text', 'image', 'pdf']],
];

const firstMatch = (rules, id) => {
  for (const [re, v] of rules) if (re.test(id)) return v;
  return null;
};
const prettyName = (id) => {
  let s = id.split('/').pop().replace(/-/g, ' ');
  for (const [re, rep] of [
    [/\bv(\d)/g, 'V$1'],
    [/\bglm\b/gi, 'GLM'], [/\bqwen\b/gi, 'Qwen'], [/\bkimi\b/gi, 'Kimi'], [/\bmimo\b/gi, 'MiMo'],
    [/\bstep\b/gi, 'Step'], [/\bgrok\b/gi, 'Grok'], [/\bdeepseek\b/gi, 'DeepSeek'],
    [/\bminimax\b/gi, 'MiniMax'], [/\bgpt\b/gi, 'GPT'], [/\bhy(\d)\b/gi, 'Hy$1'],
    [/\bcode\b/gi, 'Code'], [/\bhighspeed\b/gi, 'HighSpeed'], [/\bvision\b/gi, 'Vision'],
    [/\bexp\b/gi, 'exp'], [/\bfree\b/gi, 'Free'], [/\bfast\b/gi, 'Fast'], [/\bpro\b/gi, 'Pro'],
    [/\bmax\b/gi, 'Max'], [/\bplus\b/gi, 'Plus'], [/\bflash\b/gi, 'Flash'],
    [/\bpreview\b/gi, 'Preview'], [/\bultra\b/gi, 'Ultra'], [/\bsmall\b/gi, 'Small'],
  ]) s = s.replace(re, rep);
  return s.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
};

// ---------- data ----------
async function fetchJson(url, token) {
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

function bridgeKey() {
  try { return JSON.parse(fs.readFileSync(BRIDGE_CONFIG, 'utf8')).apiKey || null; } catch { return null; }
}

async function bridgeModels() {
  const token = bridgeKey();
  const j = await fetchJson(`http://127.0.0.1:${PORT}/v1/models`, token);
  return { ids: (j.data || []).map((m) => m.id), token };
}

async function upstreamContext() {
  const map = new Map();
  try {
    const j = await fetchJson(UPSTREAM_MODELS);
    for (const m of j.data || []) map.set(m.id, m.context_length || 0);
  } catch { /* fall back to 1M */ }
  return map;
}

// ---------- main ----------
const { ids, token } = await bridgeModels();
const bridgeClientKey = token || bridgeKey();
if (!bridgeClientKey) {
  console.error(`No client API key found in ${BRIDGE_CONFIG} - start the bridge once so it generates one.`);
  process.exit(1);
}
const ctxMap = await upstreamContext();

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`ZCode config not found: ${CONFIG_PATH}\nStart ZCode once so it creates the file.`);
  process.exit(1);
}
let cfg;
try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
catch (e) { console.error(`ZCode config is not valid JSON, aborting: ${e.message}`); process.exit(1); }
if (!cfg.provider || typeof cfg.provider !== 'object') { console.error('Config has no provider section, aborting.'); process.exit(1); }

let pid = Object.keys(cfg.provider).find((k) =>
  typeof cfg.provider[k] === 'object' &&
  String(cfg.provider[k]?.options?.baseURL || '').includes(`127.0.0.1:${PORT}`));

if (REMOVE) {
  if (!pid) { console.log('No provider written by this tool - nothing to remove.'); process.exit(0); }
  delete cfg.provider[pid];
  console.log(`-> removing provider ${pid}`);
} else {
  const models = {};
  for (const id of ids) {
    const reason = firstMatch(REASONING_RULES, id);
    const entry = {
      name: prettyName(id),
      limit: { context: ctxMap.get(id) || 1000000, output: Math.min(firstMatch(OUTPUT_RULES, id) || DEFAULT_OUTPUT, GATEWAY_MAX_OUTPUT) },
      modalities: { input: firstMatch(INPUT_RULES, id) || ['text'], output: ['text'] },
      zcode: { modalitiesConfigured: true },
    };
    if (reason) entry.reasoning = { enabled: true, variants: reason.variants, defaultVariant: reason.defaultVariant };
    models[id] = entry;
  }
  const provider = {
    name: PROVIDER_NAME,
    kind: 'openai-compatible',
    options: { apiKey: bridgeClientKey, apiKeyRequired: true, baseURL: BASE_URL },
    source: 'custom',
    models,
  };
  if (!pid) pid = crypto.randomUUID().toLowerCase();
  const existed = Boolean(cfg.provider[pid]);
  cfg.provider[pid] = provider;
  console.log(`-> ${existed ? 'updating' : 'creating'} provider "${PROVIDER_NAME}" id=${pid}`);
  console.log(`   kind=openai-compatible  baseURL=${BASE_URL}`);
  console.log(`   models: ${Object.keys(models).length} (context from the public catalog, 1M fallback)`);
  console.log(`   with reasoning variants: ${Object.values(models).filter((m) => m.reasoning).length}`);
  const missing = ids.filter((id) => !ctxMap.has(id));
  if (missing.length) console.log(`   warn: not in the public catalog (1M assumed): ${missing.join(', ')}`);
}

const out = JSON.stringify(cfg, null, 2) + '\n';
if (!APPLY) {
  console.log('\n== preview only: nothing written. Re-run with --apply ==');
  console.log(`   target file   : ${CONFIG_PATH}`);
  fs.writeFileSync(PREVIEW, out, 'utf8');
  console.log(`   full preview  : ${PREVIEW}`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, '');
const backup = `${CONFIG_PATH}.bak-${stamp}`;
fs.copyFileSync(CONFIG_PATH, backup);
fs.writeFileSync(CONFIG_PATH, out, 'utf8');
JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); // read-back validation
console.log(`\nOK  wrote ${CONFIG_PATH}`);
console.log(`    backup: ${backup}`);
console.log('    Next: fully quit and restart ZCode; the CommandCode Go provider appears in the model picker.');
