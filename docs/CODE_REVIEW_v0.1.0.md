# AMTA Companion v0.1.0 — Meticulous Code Review & Service Verification

**Reviewer scope:** full repository `waleedmandour/amta-companion` @ `7fd3265` (main), published release v0.1.0, CI/CD runs, and live verification of the external services the roadmap depends on (Groq, LM Studio, Tauri toolchain, Node/runner images). Reviewed 2026-09-25.

**Method:** every tracked file read line-by-line; all external claims checked against primary sources on the day (crates.io API, GitHub API for tauri-action tags/runs, actions/runner-images README, Groq rate-limit tables, LM Studio issue tracker); add-on cross-check against the shipped Round-4 `Code.gs` provider layer.

---

## A. Executive verdict

| Question | Answer |
|---|---|
| Safe to install and try right now? | **Yes.** The shipped binary has no network egress from the webview, `capabilities` = `core:default` only (no fs/shell/http), and no secrets embedded. |
| Any blockers? | **None.** All findings are hardening or roadmap-hygiene items. |
| Consistent with the add-on (Round 4)? | **Yes** — endpoints, https-only rule, bearer, json_schema strategy and quota semantics all line up; one M1 contract note below (§D). |
| Overall code quality at M0 | High for a bootstrap: minimal surface, correct Tauri 2 idioms, honest docs, working 3-OS release pipeline. |

**Totals: 0 blockers · 3 medium · 5 minor · 7 nits** — details in §C.

---

## B. Live service verification (checked 2026-09-25)

| Service / dependency | Current reality (primary source) | Repo's assumption | Verdict |
|---|---|---|---|
| **Tauri (Rust crate)** | stable **2.11.6** (2026-09-21); MSRV **1.77.2** (crates.io, version metadata); Tauri **3.0.0-alpha.2** exists but alpha | `tauri = "2"` → floats to 2.11.x ✓ | ✅ OK; see F-4 (MSRV under-declared) |
| **tauri-build** | 2.6.3 stable | `tauri-build = "2"` ✓ | ✅ |
| **tauri-action** | latest release **`action-v1.0.0`** (2026-06-29); tag `v0` resolves to `fce9c610` (0.6.x line, last 0.6.2 = 2026-03-14) — the two have **diverged** | workflow pins `@v0` | ⚠️ F-6 — works today; must move at M1 (updater breaking changes) |
| **Groq free tier** | gpt-oss-120b: **30 req/min, 1,000 req/day** (rate-limit table retrieved 2026-08); GPT-OSS 20B/120B + Llama family; Llama-3.x enterprise-only since Aug 2026 | Code.gs: AIMD floor ≈27 rpm, `dailyBackstop: 800` (< 1,000) ✓; same model guidance | ✅ **consistent** — add-on is deliberately more conservative than the real tier |
| **LM Studio** | `/v1/chat/completions` supports native `json_schema` structured output; **`/v1/responses` does NOT support structured output** (open GitHub issue, Sep 14, 2026); OpenAI- and Anthropic-compatible endpoints, REST + SDKs | add-on uses `/v1/chat/completions` + `response_format: json_schema` with graceful degradation ✓ | ✅ correct endpoint; **M1 note**: the companion proxy must implement `/v1/chat/completions` + `/v1/models` and must **not** advertise `/v1/responses` |
| **Node.js in CI** | **Node 20 reached EOL on April 30, 2026** — no more security patches; Node 22 = maintenance LTS, Node 24 = active LTS until 2028-04-30 | both workflows pin `node-version: 20` | ❌ F-2 — bump to 22/24 |
| **ubuntu-22.04 runner image** | still listed in `actions/runner-images` README (no retirement announced); `libwebkit2gtk-4.1-dev` available — correct for Tauri 2 | workflows pin `ubuntu-22.04` | ✅ OK (22.04 was pinned deliberately for glibc stability in the release plan) |
| **macos-latest runner** | ARM (M-series); universal build needs both targets — toolchain step installs `aarch64-apple-darwin,x86_64-apple-darwin` | ✓ | ✅ |

---

## C. Findings (severity-rated)

### MEDIUM

**F-1 · The "IPC proven end-to-end" claim is not actually exercised.**
`main.rs` comment: *"the command already proves the IPC + build pipeline end to end"* — but `index.html` contains **zero `<script>` tags**, there is no `@tauri-apps/api` dependency, and `app.withGlobalTauri` is not enabled. The `ping` command is registered in the invoke handler but nothing can ever call it. The M0 milestone's central claim (IPC round-trip works) is therefore untested, and `cargo test` has no test either.
**Fix (5 minutes, no new deps):** set `"app": { "withGlobalTauri": true }` in `tauri.conf.json` and add to `index.html`:
```html
<script>
  window.addEventListener("DOMContentLoaded", () => {
    window.__TAURI__.core.invoke("ping")
      .then((msg) => document.getElementById("ipc-status").textContent = "✅ " + msg)
      .catch((e) => document.getElementById("ipc-status").textContent = "❌ " + e);
  });
</script>
```
plus a `<p id="ipc-status">IPC: checking…</p>` line. This also gives you something *visible* when you try the app on each OS — a real IPC proof instead of a static page.

**F-2 · Node 20 is EOL in both workflows.**
`.github/workflows/ci.yml` and `release.yml` pin `node-version: 20`. Node 20 stopped receiving security updates on **2026-04-30**. Bump to `22` (conservative, maintenance LTS) or `24` (active LTS until 2028). Pure CI change; no artifact impact.

**F-3 · `security.csp: null`.**
Acceptable for the M0 static shell, but Tauri's guidance is to always set a CSP, and M2 (manuscript reader rendering third-party-derived text) makes it mandatory. Cheap to add now:
```json
"csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost"
```
(`unsafe-inline` for styles is required by the current inline `style` usage; `connect-src` allows the Tauri IPC bridge on Windows/macOS respectively.)

### MINOR

**F-4 · `rust-version = "1.77"` under-declares the MSRV.**
`tauri` 2.11.6 declares MSRV **1.77.2** (crates.io version metadata — verified). A contributor on 1.77.0/1.77.1 gets an opaque crate error instead of the clean rustc gate. Set `rust-version = "1.77.2"`.

**F-5 · Vite `build.target: "es2021"` vs webview baselines.**
The official Tauri template conditionally targets `chrome105` (Windows) / `safari13` (macOS/Linux) because the frontend must compile for the *oldest* bundled WebView. `es2021` permits logical-assignment operators (`??=`, `||=`, `&&=`) that Safari 13/14-era WebViews (macOS 10.15/11) don't parse. **Zero impact today (no JS ships)** — but it becomes a real crash class at M1. Template-accurate config:
```js
build: {
  target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
  minify: !process.env.TAURI_ENV_DEBUG,
  sourcemap: !!process.env.TAURI_ENV_DEBUG
}
```

**F-6 · `tauri-apps/tauri-action@v0` is the stale 0.6.x line.**
Tag `v0` resolves to `fce9c610` ≠ latest `action-v1.0.0` (`1deb371b`, 2026-06-29). v1.0.0's breaking changes: (a) `.app.tar.gz` names now include the version; (b) **`latest.json` URLs switch to github.com URLs** — directly relevant to the M1 auto-updater; (c) drops Tauri v1/alpha support (irrelevant to us). **Action:** at M1, when updater artifacts land, move to v1.0.0 **pinned by full commit SHA**, and re-verify updater config against the new `latest.json` URL scheme. Not a defect today — v0.1.0 built and released successfully on v0.

**F-7 · Supply-chain hardening deferred.**
The release plan promised SHA-pinned Actions; shipped workflows use mutable major tags (`actions/checkout@v4`, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`, …). Acceptable for M0; record it and pin at the M1 hardening pass together with Dependabot (actions + cargo + pnpm ecosystems).

**F-8 · No `pnpm-lock.yaml` yet.**
Deliberate at M0 (`--no-frozen-lockfile`, documented in both workflows ✓). At M1: commit the lockfile, switch CI to `pnpm install --frozen-lockfile`, and drop the "no cache" comments — otherwise builds are not reproducible and the `setup-node` pnpm cache stays disabled.

### NITS

1. `styles.css`: `--blue` defined but unused (only `--blue-dark` is used).
2. `src-tauri/icons/master_1024.png` is committed but not referenced by `tauri.conf.json` — fine as the regeneration source for `gen_icons.py`; consider moving to `design/` to keep `icons/` to the bundler's set.
3. `package.json` lacks `"type": "module"` — works today because Vite pre-bundles the config; the official template sets it.
4. `libfuse2` is installed in `release.yml`'s Linux step but not in `ci.yml` — harmless asymmetry (CI runs `--no-bundle`); add for parity or leave.
5. Window has no `minWidth`/`minHeight` — set sensible minima before M1 puts real UI in it.
6. Version lives in three literals (`package.json`, `Cargo.toml`, `tauri.conf.json`) — they match today (0.1.0 ✓); add a one-line `scripts/bump.sh` or a documented lockstep rule to prevent drift at v0.2.
7. `serde`/`serde_json` are declared but unused at M0 — intentional (M1 needs them); noted so a future `cargo-udeps` pass doesn't flag them as dead.

---

## D. Consistency matrix — Companion (M1 target) ↔ Add-on (shipped Round 4 `Code.gs`)

| Contract item | Add-on side (shipped code) | Companion M1 obligation | Status |
|---|---|---|---|
| Chat endpoint | `chatPath: '/v1/chat/completions'` (`LLM_PROVIDER_LAYER.lmstudio`) | Expose exactly this path, LM Studio-shaped request/response pass-through | ✅ aligned; implement byte-compatibly |
| Model discovery | `modelsPath: '/v1/models'`; 10-min hint cache; `LMSTUDIO_MODEL` override; 404 self-heal | `/v1/models` must return `{ "data": [ { "id": … } ] }` | ✅ aligned |
| Transport | `normalizeLmStudioUrl_` **rejects non-https** (UrlFetchApp constraint) | Must sit behind an HTTPS tunnel (ngrok/cloudflared); plain http is unreachable by design | ✅ aligned (plan matches) |
| Auth | Optional bearer token on requests | **Require** bearer on tunnels (per Option C plan) — recommend stating this in the settings-dialog how-to text | ✅ aligned; wording tweak suggested |
| Structured output | Native `json_schema` via `openAiJsonSchemaFromGemini_`, graceful retry without `response_format` | Pass `response_format` through untouched; **do not** implement `/v1/responses` (it lacks structured output in current LM Studio) | ✅ aligned; M1 spec note added |
| Timeout ceiling | UrlFetchApp ≈ 60 s | Proxy + local model must answer in ≲55 s or degrade; already flagged in PROVIDER_NOTES | ✅ documented |
| Pacing | `minGapMs: 200` courtesy gap | May serialize per-connection for laptop GPUs | ✅ compatible |
| Quota semantics (Groq) | `dailyBackstop: 800` < real free tier 1,000/day (verified) | n/a (Groq is add-on-side) | ✅ consistent |

**Conclusion:** the add-on will be able to talk to the companion at M1 **with zero changes** if the obligations above are honored — that was the design goal of Option C's tunnel mode, and the shipped add-on side is already contract-complete.

---

## E. Lexicography-angle assessment

1. **Honest M0.** The shell makes no lexicographic claims — roadmap card and README describe exactly what ships. Good scholarly hygiene.
2. **M2 grounding is the heart of it.** "Grounded definitions with source URLs" is what makes the companion a *lexicographic* tool rather than a chat wrapper — it operationalizes the evidence-first triangulation of the AMTA method (lexical/etymological + corpus + AI, each leg auditable). **Recommendation:** give the grounding store provenance fields from day one — `source_url`, `fetch_date`, `robots_status`, `license_hint`, `extraction_method` — mirroring the citation discipline already shipped in the add-on (BAWE, OSF, Semantic Scholar attributions).
3. **v0.1.0 is now a public binary that crawls the web (at M2).** Reiterate the plan's robots.txt + rate-limit + cache requirements before M2 ships, and add a first-run notice that users are responsible for compliant use against publisher sites. Academic norms are the project's brand — enforce them in code, not just docs.
4. **Terminology continuity.** When the companion gets UI, reuse the bilingual guide's exact glossary (Keyness = «الأهمية المميزة», Reference Freq = «التكرار المرجعي», etc.) so the two products read as one system.

---

## F. Release & security posture (verified live)

- Release **v0.1.0 published** 2026-09-25 12:08 UTC; 7 assets; CI + Release green on `7fd3265`; first downloads observed (AppImage 1, dmg 1).
- Git history scanned: **0 occurrences** of any credential — the PAT was only ever in the remote URL, never committed. `.gitignore` covers `*.p12/*.key/*.pem/.env*` and `gen/schemas`.
- `NOTICE` is embedded in LICENSE §23 as the README states ✓.
- The working tree's "all files modified" noise on Linux is **file-mode only** (644→755, zero content delta) — `git config core.fileMode false` silences it.
- Standing reminder: the GitHub PAT shared in chat earlier should be **rotated** — it remains in chat history regardless of repo hygiene.

---

## G. Prioritized action list

| # | When | Action | Effort |
|---|---|---|---|
| 1 | Now (→ v0.1.1) | F-1 wire `ping` IPC into the UI (`withGlobalTauri` + 6-line script); F-2 Node 22/24; F-4 `rust-version 1.77.2` | ~15 min, CI-only + tiny frontend |
| 2 | Now (can ride #1) | F-3 strict CSP; nit 3 `"type": "module"`; nit 5 window minima | ~10 min |
| 3 | M1 | F-8 commit lockfile + frozen installs; F-6 tauri-action → v1.0.0 SHA-pinned + updater artifacts; F-7 SHA-pin all actions + Dependabot | half-day |
| 4 | M2 | F-5 Vite webview targets; grounding-store provenance fields; robots/ToS guardrails in code | with the feature |
| 5 | Immediate | Rotate the exposed GitHub PAT | 5 min |

**Bottom line:** ship-safe today, contract-complete for the add-on bridge, and the three medium findings are all "cheap now, expensive later" items — ideal content for a v0.1.1 housekeeping tag before M1 work starts.
