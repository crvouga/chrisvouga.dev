import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_DIR } from "./lib/paths.ts";

const CLAUDE_REDIRECT = "https://console.anthropic.com/oauth/code/callback";

/** Prefer Anthropic's supported manual callback for Claude; leave other providers alone. */
const REDIRECT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /("codex"===(\w+)\?"http:\/\/localhost:1455\/auth\/callback":"xai"===\2\?"http:\/\/127\.0\.0\.1:56121\/callback"):`http:\/\/localhost:\$\{(\w+)\}\/callback`/g,
    `$1:"claude"===$2?"${CLAUDE_REDIRECT}":\`http://localhost:\${$3}/callback\``,
  ],
  [
    /("codex"===(\w+)\?"http:\/\/localhost:1455\/auth\/callback":"xai"===\2\?"http:\/\/127\.0\.0\.1:56121\/callback"):window\.location\.origin\+"\/callback"/g,
    `$1:"claude"===$2?"${CLAUDE_REDIRECT}":window.location.origin+"/callback"`,
  ],
];

/** Allow pasting raw Anthropic console codes (code#state) without a full URL. */
const PASTE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /if\("kimchi"===(\w+)&&(\w+)&&!\2\.includes\(":\/\/"\)&&!\2\.includes\("\?"\)\)return void await (\w+)\(\2,null\);/g,
    'if("kimchi"===$1&&$2&&!$2.includes("://")&&!$2.includes("?"))return void await $3($2,null);if("claude"===$1&&$2&&!$2.includes("://"))return void await $3($2,null);',
  ],
];

function walk(d: string): void {
  let entries;
  try {
    entries = readdirSync(d, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
      continue;
    }
    if (!p.endsWith(".js")) continue;
    const t = readFileSync(p, "utf8");
    let n = t;
    for (const [re, rep] of REDIRECT_PATTERNS) n = n.replace(re, rep);
    for (const [re, rep] of PASTE_PATTERNS) n = n.replace(re, rep);
    if (n !== t) {
      writeFileSync(p, n);
      console.log("oauth-redirect patched", p);
    }
  }
}

export function patchOAuthRedirect(rootDir?: string): void {
  const target = rootDir ? resolve(rootDir) : resolve(APP_DIR, ".next");
  walk(target);
}
