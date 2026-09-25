# AMTA Companion — GitHub Repo & Cross-Platform Release Plan

> Status: **PLAN (build-ready)** — the operating plan for hosting the Option C Tauri desktop
> app on GitHub and shipping signed installers for **Windows, macOS (Apple) and Linux**.
> Companion document: `OPTION_C_LOCAL_COMPANION_PLAN.md` (architecture & feature scope).
> This document covers everything from `git init` to users double-clicking an installer.

---

## 1. Decisions to lock before `git init`

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Repo name | `amta-companion` / `amta-lexicography-companion` | **`amta-companion`** — short, matches the add-on dialogs |
| D2 | Repo visibility | Public / Private | **Public**. Two hard reasons: (a) GitHub's macOS runners bill minutes at **10× on private repos** — release builds for 3 platforms get expensive fast; (b) users (and their IT departments) trust installers they can inspect. No secrets ever live in the repo (§8), so public is safe. If you must go private, budget for the macOS minutes or offload macOS builds to a self-hosted Mac mini runner. |
| D3 | License | MIT / Apache-2.0 / proprietary EULA file | **MIT** for the app skeleton + a clear NOTICE that the AMTA brand/assets are yours. Licensing attracts contributors; you keep the add-on marketplace separate anyway. |
| D4 | Windows signing | Azure Trusted Signing / OV cert (PFX) / unsigned for now | **Start unsigned, add Azure Trusted Signing at M4** (needs an identity-verified Microsoft account, ~$9.99/mo). An OV PFX also works in CI via secrets; EV USB-token certs do **not** work on GitHub-hosted runners. |
| D5 | Apple signing | Enroll in Apple Developer Program now / defer | **Enroll on day 1** — verification can take days. US$99/yr. Without it, macOS users must right-click ▸ Open (Gatekeeper warning) and you can't notarize. |
| D6 | Frontend stack | Vanilla TS + Vite / Svelte / React | **Vite + TypeScript (minimal)**. The UI is a tray icon + one settings window; a heavy framework is dead weight and slows Rust+JS builds. |
| D7 | Update channel | Tauri v2 auto-updater / manual download only | **Tauri auto-updater from M1** — keys generated on day 1 (§7). Losing updater keys later forces every user to reinstall manually; generate and back them up now. |

---

## 2. One-time setup checklist (accounts & tooling)

**Accounts**
- [ ] GitHub account with 2FA; create repo `amta-companion` (D2).
- [ ] Apple Developer Program enrollment (D5) → generate a **Developer ID Application** certificate; export it as a `.p12` (you'll base64 it into a secret later).
- [ ] Create an **app-specific password** for Apple ID (for notarytool) — appleid.apple.com ▸ Sign-In and Security.
- [ ] (M4) Azure Trusted Signing account (D4), or purchase an OV code-signing cert.
- [ ] (Optional) Tailscale account if you ever want self-hosted macOS builds.

**Local dev machine (any one OS to start)**
- [ ] Rust `stable` via rustup + `cargo-tauri` CLI: `cargo install tauri-cli --version "^2"`.
- [ ] Node.js 20 LTS + `pnpm` (`corepack enable`).
- [ ] Linux only: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
- [ ] macOS only: `rustup target add x86_64-apple-darwin aarch64-apple-darwin` (universal binary).
- [ ] Generate the updater signing keys **once**, store the private key safely OFF the repo:
      `pnpm tauri signer generate -w ~/.tauri/companion.key` → paste the **public** key into `tauri.conf.json`, the **private** key + password into GitHub Secrets at M1 (§8).

---

## 3. Repository layout

```
amta-companion/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # PR gate — 3-OS matrix (§5)
│   │   └── release.yml             # tag-triggered signed builds (§6)
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   ├── dependabot.yml              # cargo + npm weekly
│   └── PULL_REQUEST_TEMPLATE.md
├── src/                            # frontend (tray UI, settings window)
│   ├── main.ts
│   ├── settings.ts
│   └── styles.css
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri entry; tray; single-instance
│   │   ├── server.rs               # axum: /v1/chat/completions, /v1/models (M1)
│   │   ├── llm/
│   │   │   ├── lmstudio.rs         # bridge to LM Studio's local server (M1)
│   │   │   └── llamacpp.rs         # embedded fallback runtime (M5, optional)
│   │   ├── reader/                 # manuscript fetch + trafilatura + PDF (M2)
│   │   ├── store/                  # SQLite grounding store (M2)
│   │   ├── mailbox/                # Drive jobs/results poller (M3)
│   │   └── auth.rs                 # mandatory bearer token on tunnel routes (M1)
│   ├── capabilities/default.json   # least-privilege Tauri permissions
│   ├── tauri.conf.json             # bundle ids, updater pubkey, CSP
│   ├── Cargo.toml                  # workspace manifest
│   └── icons/                      # generated: pnpm tauri icon path/to/logo.png
├── docs/
│   ├── SETUP.md                    # user install guide per OS
│   ├── PRIVACY.md                  # what leaves the machine, ever
│   └── TUNNEL.md                   # tunnel + bearer-token how-to (mirrors add-on dialog)
├── .gitignore                      # target/, node_modules/, dist/, *.p12, *.key
├── LICENSE / NOTICE
├── SECURITY.md                     # private vulnerability reporting
└── package.json                    # pnpm scripts: dev / build / tauri
```

Rules baked into the layout: **no secrets or certs in the repo, ever** (`.gitignore` blocks
`*.p12`, `*.key`, `.env`); every network-capable module lives behind `auth.rs`; `docs/PRIVACY.md`
is kept truthful from M1 — it is a selling point for academic users.

---

## 4. Branching, commits, versioning

- **Trunk-based**: `main` is always releasable; short-lived feature branches (`feat/mailbox-poller`) merged by PR — no direct pushes (branch protection, §10).
- **Conventional Commits** (`feat:`, `fix:`, `chore:`) — feeds automated changelogs; enforce with a PR-title check.
- **SemVer**, tags `vMAJOR.MINOR.PATCH`. Pre-releases `v0.3.0-rc.1` publish as GitHub *pre-releases*; promote by cutting the final tag (users on auto-update stay on stable unless they opt into a prerelease channel later).
- Version bump = one PR editing `package.json` + `src-tauri/tauri.conf.json` + `Cargo.toml` (or adopt `release-please` at M4 to automate all three).

---

## 5. CI gate — `.github/workflows/ci.yml` (every PR)

Goal: a PR cannot merge unless it compiles, lints and tests on **all three OSes**.

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
permissions: { contents: read }
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-22.04, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # reads packageManager from package.json
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with: { components: clippy, rustfmt }
      - uses: Swatinem/rust-cache@v2
      - name: Linux deps
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
      - run: pnpm install --frozen-lockfile
      - run: cargo fmt --all --check
        working-directory: src-tauri
      - run: cargo clippy --all-targets -- -D warnings
        working-directory: src-tauri
      - run: cargo test
        working-directory: src-tauri
      - run: pnpm build                     # frontend typecheck + vite build
      - run: pnpm tauri build --debug --no-bundle   # full shell links on 3 OSes, cheap
```

Notes: `ubuntu-22.04` (not 24.04) pins glibc 2.35 so AppImages/debs run on older distros;
`--no-bundle` keeps CI fast — bundling happens only in the release workflow.

---

## 6. Release pipeline — `.github/workflows/release.yml` (tag `v*`)

One tag → three platforms built in parallel → signed → draft GitHub Release with all
installers + `latest.json` for the auto-updater. Uses the official `tauri-action`.

```yaml
name: Release
on:
  push: { tags: ["v*"] }
permissions: { contents: write }
jobs:
  publish:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-latest,    args: "--target universal-apple-darwin" }
          - { os: ubuntu-22.04,    args: "" }
          - { os: windows-latest,  args: "" }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.os == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - uses: Swatinem/rust-cache@v2
      - name: Linux deps
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2
      - name: Import Apple cert + notary profile
        if: runner.os == 'macOS'
        env:
          APPLE_CERTIFICATE_P12_B64: ${{ secrets.APPLE_CERTIFICATE_P12_B64 }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          echo "$APPLE_CERTIFICATE_P12_B64" | base64 --decode > /tmp/cert.p12
          security create-keychain -p pwd build.keychain
          security import /tmp/cert.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k pwd build.keychain
          security default-keychain -s build.keychain
          xcrun notarytool store-credentials AMTA_NOTARY \
            --apple-id "${{ secrets.APPLE_ID }}" \
            --password "${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}" \
            --team-id "${{ secrets.APPLE_TEAM_ID }}"
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE_P12_B64 }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: "Developer ID Application"
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # macOS notarization is driven by the APPLE_* env (notarytool profile above);
          # Windows signing via Azure Trusted Signing at M4:
          # AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET /
          # AZURE_SIGNING_ACCOUNT_NAME / AZURE_SIGNING_CERT_PROFILE (see tauri docs)
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "AMTA Companion ${{ github.ref_name }}"
          releaseDraft: true            # you QA the draft, then press Publish
          prerelease: ${{ contains(github.ref_name, '-rc') }}
          args: ${{ matrix.args }}
```

**What each platform produces per release**

| OS | Artifacts | Signing |
|----|-----------|---------|
| Windows | `.msi` (WiX, per-machine) + `.exe` (NSIS, per-user) | M1–M3: unsigned (documented SmartScreen note). M4+: Azure Trusted Signing |
| macOS | `.dmg` + universal `.app` (Intel + Apple Silicon in one file) | Developer ID + notarized + stapled (automated above) |
| Linux | `.AppImage` + `.deb` + `.rpm` | none needed |
| Updater | `latest.json` + signed `.tar.gz`/`.zip` update bundles | Tauri updater key (§7) |

---

## 7. Auto-update channel

- `tauri.conf.json` → `bundle.createUpdaterArtifacts: true`, `plugins.updater.pubkey` = the **public** half of the M0 key pair; `endpoints` = `https://github.com/<you>/amta-companion/releases/latest/download/latest.json` (GitHub-hosted, no extra server).
- The action above generates and signs `latest.json` automatically — the app polls it on launch (and behind a "Check for updates" button), downloads, verifies the signature, swaps binaries.
- **Key custody**: the private updater key can never be re-derived. Keep it in your password manager AND an offline backup. If lost, every installed app must be manually reinstalled.
- Ship the first releases as **Draft → QA on real machines → Publish** (never auto-publish).

---

## 8. Secrets inventory (GitHub ▸ Settings ▸ Secrets and variables ▸ Actions)

| Secret | Needed from | How to obtain |
|--------|-------------|---------------|
| `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) | M1 | `pnpm tauri signer generate` output (§2) |
| `APPLE_CERTIFICATE_P12_B64` | M4 (mac signing) | Keychain Access ▸ export "Developer ID Application" as .p12 → `base64 -i cert.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | M4 | password you set on the .p12 export |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | M4 | Apple ID / appleid.apple.com app password / membership page |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ACCOUNT_NAME`, `AZURE_SIGNING_CERT_PROFILE` | M4 (Windows, if Trusted Signing) | Azure portal ▸ Trusted Signing account |
| `WINDOWS_PFX_B64`, `WINDOWS_PFX_PASSWORD` | M4 (alternative to Azure) | OV cert vendor's PFX export → base64 |

Never commit `.p12`/`.key` files; if one ever lands in history, **revoke and reissue** the cert
(the Apple one is free to re-create; a paid Windows cert is not — treat it like a root password).

---

## 9. Testing & QA gates

- **Unit**: `cargo test` per module (reader extraction golden files, mailbox protocol, auth reject-paths, schema conversion).
- **Contract**: an integration test boots the embedded axum server on a random port and asserts `/v1/models` + `/v1/chat/completions` return add-on-compatible shapes (the add-on's `responseSchema` JSON is the fixture — copy it from Code.gs round 4).
- **Per-release manual QA** (10-minute checklist, done on the draft release before publishing):
  - [ ] Win 11: installer runs; tray appears; add-on's Test LM Studio against a tunnel succeeds.
  - [ ] macOS 14+ (Intel if you have one, else note universal build): Gatekeeper silent (signed builds) or right-click-open (unsigned); notarization check `spctl -a`.
  - [ ] Ubuntu 22.04 + 24.04: AppImage launches (libfuse2), deb installs.
  - [ ] Kill the local server mid-request → add-on falls through to next provider (graceful-degradation check).

---

## 10. Security & supply-chain hygiene

- **Branch protection on `main`**: require PR + green CI + 1 review (even solo — it forces self-review), disallow force pushes.
- **Pin Actions by SHA** (`uses: actions/checkout@<sha>`); Dependabot updates them weekly.
- `GITHUB_TOKEN` permissions: `contents: read` in CI, `contents: write` only in release.
- **cargo-deny + cargo-audit + pnpm audit** in CI (add as one more CI step at M2) — Rust advisories block the build.
- Tauri least privilege: `capabilities/default.json` allows only the plugins actually used; strict CSP in `tauri.conf.json`; the embedded server binds `127.0.0.1` and refuses non-localhost binds unless tunnel mode is explicitly enabled with a **required** bearer token (fixes Option B's "anyone with the URL" caveat — the add-on already has the bearer field).
- `SECURITY.md` with a private reporting channel; SECURITY-insights via GitHub's private vulnerability reporting.

---

## 11. Milestone map (repo work, refined from the C1–C5 roadmap)

| Milestone | Scope | Exit criteria (Definition of Done) |
|-----------|-------|------------------------------------|
| **M0 — Bootstrap** (½ day) | Repo, skeleton from `pnpm create tauri-app`, icons, CI green on 3 OS, branch protection, secrets placeholders documented | A "Hello tray" app builds debug on all 3 OSes from a PR |
| **M1 — C1 MVP** (2–3 wks) | LM Studio bridge, OpenAI-compatible `127.0.0.1` API with required bearer, tray UI, tunnel docs, updater keys wired, draft releases | Add-on's "Test LM Studio" passes against the companion through a tunnel; auto-update installs v0.0.2 over v0.0.1 |
| **M2 — C2 Reader** (2–3 wks) | Manuscript fetch+extract (trafilatura + PDF), SQLite grounding store, `/amta/v1/define` (crawl→RAG→schema-JSON with source URLs), cargo-deny in CI | A definition generated via companion returns with ≥1 grounding URL in the response; 80%+ module test coverage on reader |
| **M3 — C3 Mailbox** (2 wks) | Drive jobs/results folder protocol + poller; **small add-on update** (new provider id `companion` reusing `callLLM`) | Definition round-trips with zero tunnel: add-on → Drive → companion → Drive → sheet row filled |
| **M4 — C4 Packaging** (1–2 wks) | Windows Trusted Signing, macOS notarization live, signed installers, PRIVACY/SETUP docs, auto-updater promoted to default | SmartScreen/Gatekeeper silent on clean machines; QA checklist §9 fully green |
| **M5 — C5 Optional** | Embedded llama.cpp fallback, managed relay, model download manager, batch UI | by demand |

---

## 12. Day-1 command checklist

```bash
# 1. Scaffold
pnpm create tauri-app amta-companion --template vanilla-ts --manager pnpm --yes
cd amta-companion

# 2. Local sanity (installs deps, opens a dev window with tray stub)
pnpm install && pnpm tauri dev

# 3. Repo + CI
git init -b main
gh repo create amta-companion --public --source=. --push
mkdir -p .github/workflows   # paste ci.yml + release.yml from §§5–6
git add .github && git commit -m "ci: 3-OS matrix gate" && git push

# 4. Verify the PR gate: open a trivial PR and watch all 3 matrix legs go green.

# 5. Updater keys (backup the private key OFFLINE before anything else)
pnpm tauri signer generate -w ~/.tauri/companion.key

# 6. Start Apple Developer enrollment in parallel (D5) — it gates M4, not M0–M2.
```

Then follow §11: M1 starts with `server.rs` + `llm/lmstudio.rs` — the same day CI is green,
your add-on can already talk to the companion exactly the way it talks to LM Studio (Option B
path), which makes M1 independently shippable as `v0.1.0`.

---

## 13. Risk register (top items)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Apple Developer verification delay | M4 blocked | Enroll day 1; everything up to M3 is unsigned-friendly |
| SmartScreen warning on new Windows cert | User friction at M4 | Trusted Signing builds reputation over time; document the one-click "More info ▸ Run anyway" for early adopters; ship MSI (smarter reputation than raw EXE) |
| Private repo macOS runner cost | Budget burn | Public repo (D2) or self-hosted Mac runner |
| Updater key loss | All users must reinstall | Offline backup at generation time (§7) |
| glibc/AppImage drift on old distros | Linux users locked out | Pin `ubuntu-22.04` builders; test on 22.04 + 24.04 |
| Tunnel URL rotation confuses users | Support load | Companion keeps its bearer token stable across restarts and deep-links `amta-companion://tunnel-status` from the settings dialog (M2) |
| LM Studio not installed | C1 blocked | Clear SETUP.md; M5 embedded runtime removes the dependency entirely |
