# Option C — Local Companion Application: Design Plan

> Status: **PLAN (not implemented)** — per the agreed roadmap, A (Groq fallback) and B (LM
> Studio tunnel) ship first; this document is the plan for C so it can be reviewed and
> scheduled. Nothing here requires changes to the shipped round-4 code: the companion slots
> into the same `callLLM` provider architecture.

---

## 1. Vision

The user's stated vision: *"a local service that can crawl into the web to read the manuscripts
to form definitions, translations, and examples for suggested terms."*

Option B already lets the add-on *use* a local model through a tunnel. Option C goes further:
a shippable desktop application ("AMTA Companion") that adds to that model:

1. **Web reading** — fetches and parses real manuscript sources (open-access paper pages,
   preprint servers, dictionary/reference sites) instead of relying on parametric memory;
2. **Definition/translation/example drafting** — grounded in the crawled text (RAG with
   citations to the source URLs);
3. **Sheet-shaped answers** — returns exactly the JSON contract the add-on already sends
   (same `responseSchema` fields), so the add-on treats it as just another provider.

In short: C = B's local inference + a research crawler + a packaging story that a
non-technical lexicographer can install.

---

## 2. Why a companion (and not just "tunnel your LM Studio")

| Need | Tunnel (B) | Companion (C) |
|------|-----------|---------------|
| Local model inference | manual setup (LM Studio + tunnel) | one installer, auto-configured |
| Web/manuscript reading | not possible server-side (Apps Script can't crawl arbitrary sites through whitelists) | the companion crawls locally, where there is no `urlFetchWhitelist`, no Google IP blocks, and the user's own cookies/network apply |
| NAT reachability | requires a public tunnel URL that rotates | can work **without any tunnel** via the Drive-mailbox mode (§4.2) |
| Rate limits / quotas | none locally | none locally |
| Distribution to end users | per-user DIY | signed installers (Win/macOS/Linux) |

The decisive advantage is the crawler: Apps Script can only call the whitelisted academic APIs,
and several manuscript sources (publisher landing pages, PDFs, reference works) are awkward or
impossible from Google's IP ranges. A local worker reads them the way the researcher's own
browser does.

---

## 3. Component architecture

```
┌────────────────────────────────────────────────────────────┐
│                    AMTA Companion (desktop)                │
│                                                            │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │ Tray UI  │──▶│ Job Router   │──▶│ LLM Runtime        │  │
│  │ (status, │   │ (queue,      │   │ llama.cpp / Ollama │  │
│  │  config) │   │  dedupe)     │   │ or LM Studio bridge│  │
│  └──────────┘   └──────┬───────┘   └────────────────────┘  │
│                        │                                   │
│                 ┌──────▼───────┐   ┌────────────────────┐  │
│                 │ Manuscript   │──▶│ Grounding Store    │  │
│                 │ Reader       │   │ SQLite (text+URL+  │  │
│                 │ (fetch+parse)│   │ hash, per project) │  │
│                 └──────────────┘   └────────────────────┘  │
│                        │                                   │
│                 ┌──────▼───────────────────────────────┐   │
│                 │ Local HTTP API  /v1/chat/completions │   │
│                 │ + /amta/v1/define  (superset API)    │   │
│                 └──────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
             ▲                              ▲
   tunnel mode (same as B)      mailbox mode (§4.2, no tunnel)
```

- **LLM Runtime**: default to LM Studio's local server if installed (the companion is a thin
  supervisor around it, reusing what the user already knows), with an embedded llama.cpp
  server as the zero-dependency fallback. Same OpenAI-compatible surface for both.
- **Manuscript Reader**: URL fetcher + readability extractor (trafilatura/Readability class) +
  PDF text extraction; honors robots.txt; polite per-host pacing; caches by URL hash so
  re-runs don't re-download.
- **Grounding prompts**: the companion assembles `term + domain + extracted passages (≤ N
  chars, with URLs)` into the *same* prompts the add-on uses today, then enforces the same
  `responseSchema` (all-string fields) so results paste into the sheet unchanged.
- **Local API**: intentionally OpenAI-compatible `/v1/chat/completions` (so option-B style
  tunneling keeps working with zero add-on changes) *plus* a convenience `/amta/v1/define`
  endpoint that does crawl+ground+generate in one call.

---

## 4. Connectivity modes (how the add-on reaches the companion)

### 4.1 Tunnel mode (day 1 — already works with round 4)
Identical to Option B: the companion (or LM Studio behind it) gets an HTTPS tunnel URL; the
user pastes it into Tools ▸ LLM Provider Settings. Zero new add-on code. This is the C-MVP.

### 4.2 Drive-mailbox mode (C signature feature — no tunnel, NAT-friendly)
Apps Script cannot call into a NAT'd laptop, but it *can* write to the user's own Drive, and
the companion (running on that laptop, already OAuth'd to the user's Google account via the
installed flow) can poll the same location:

1. Add-on (free-tier-friendly): writes a small request JSON to a per-user app folder
   (`amta-companion-<emailHash>/jobs/<jobId>.json`) and continues or waits per its own budget.
2. Companion polls that folder every few seconds while "on duty" (Drive changes API or plain
   polling), executes crawl+LLM, writes `results/<jobId>.json`.
3. Add-on reads the result file and fills the row.

Properties: no public URL, no tunnel dependency, survives IP changes, works behind
firewalls. Costs: adds latency (seconds, not milliseconds — acceptable for lexicography
batches) and needs a new small server-side module + one Drive scope the add-on already has
(`drive.file`). This mode also survives the user *closing* the tunnel but not the companion.

### 4.3 Managed relay (future, optional)
A tiny hosted broker (e.g. Cloudflare Worker) pairing add-on ↔ companion via per-user pairing
codes, for users who want mailbox latency without Drive folder clutter. Defer until mailbox
mode proves demand; adds a hosted component (cost + privacy surface).

---

## 5. Tech stack (proposed)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Shell/UI | **Tauri 2** (Rust + system webview) | ~10 MB installers vs Electron's ~100 MB; tray + small settings window is all we need |
| Job router / API | Rust (axum) or Node sidecar | OpenAI-compatible route re-export; queue + dedupe |
| LLM runtime | LM Studio bridge first; embedded llama.cpp server as fallback | users may already have LM Studio from option B |
| Reader | Rust: reqwest + trafilatura; PDF: pdfium bindings | one binary, no Python runtime for end users |
| Store | SQLite per project | grounding cache, job history, audit |
| Packaging | signed installers + auto-update (Tauri updater) | institutional machines tolerate MSI/DMG best |

---

## 6. Security & privacy model

- **Local-first**: API binds to `127.0.0.1` by default; tunnel/mailbox only when explicitly
  enabled; a first-run privacy screen explains exactly what leaves the machine (crawled
  requests, prompts to the local model — nothing else; no telemetry).
- **Tunnel hardening**: companion generates a bearer token and *requires* it on tunnel routes
  (fixes the "anyone with the URL" caveat from option B); the add-on already supports the
  bearer field.
- **Crawling etiquette**: robots.txt honored, per-host rate caps, explicit user-visible allow
  list; publisher paywalls are *not* bypassed — only open-access content is read.
- **Auditability**: every produced definition stores its grounding URLs alongside the text —
  this doubles as the citation feature lexicographers need for publication.
- **Provenance flag**: results generated via the companion can be marked in the sheet (e.g.
  audit-log entry "provider=local-companion, sources=2 URLs"), keeping the AMTA compliance
  trail honest.

---

## 7. Roadmap

| Milestone | Scope | Depends on |
|-----------|-------|------------|
| **C1 — MVP (2–3 wks)** | Tauri shell + LM Studio bridge + OpenAI-compatible local API + tunnel-with-token; add-on unchanged (uses option-B path) | shipped round 4 |
| **C2 — Reader (2–3 wks)** | Manuscript reader + grounding store + `/amta/v1/define` (crawl→RAG→schema-JSON); add-on keeps calling it through the tunnel as if it were a chat API | C1 |
| **C3 — Drive mailbox (2 wks)** | Server-side mailbox module (jobs/results folder protocol) + companion poller; "no tunnel needed" mode | C1 (+ small add-on update) |
| **C4 — Packaging (1–2 wks)** | Signed installers, auto-update, first-run privacy screen, docs | C2 or C3 |
| **C5 — Optional** | Managed relay; model download manager; batch "definition sprint" UI inside the companion | demand |

Estimates assume one developer; the mailbox protocol (C3) is the only piece that touches the
add-on again, and it is additive (new provider id `companion`, reusing `callLLM`).

---

## 8. Decisions to confirm before starting C1

1. **Runtime preference**: ride on LM Studio (smaller companion, two installs) vs embedded
   llama.cpp (one installer, bigger download)?  — *default: bridge-first with embedded
   fallback.*
2. **Mailbox vs tunnel priority**: which is the first-class C experience for your users?
   — *tunnel is zero-add-on-change; mailbox is the differentiator.*
3. **Grounding scope for v1**: open-access HTML pages only, or also PDF extraction?
4. **Distribution**: public download page vs GitHub releases is fine? (signed installers need
   an Apple Developer ID / Windows code-signing cert — budget line item.)
