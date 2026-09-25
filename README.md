# AMTA Companion

Local lexicography engine for the **AMTA Lexicography Assistant** Google Sheets add-on
(Option C of the Gemini-alternatives roadmap): the user's own machine hosts the model and,
from **M2**, reads real manuscripts from the open web to ground definitions, translations
and examples — with source citations.

Built with [Tauri 2](https://tauri.app) (Rust + system webview) → small, fast installers.

## Roadmap

| Milestone | Scope | Status |
|-----------|-------|--------|
| M0 — Bootstrap | Cross-platform shell + release pipeline | ✅ **v0.1** |
| M1 — MVP | LM Studio bridge + OpenAI-compatible local API (tunnel + bearer token) | 🚧 |
| M2 — Reader | Manuscript fetch/extract + grounding store + `/amta/v1/define` | 🚧 |
| M3 — Mailbox | Drive-folder job protocol — no tunnel needed | 🚧 |
| M4 — Packaging | Apple notarization + Windows Trusted Signing + auto-updater | 🚧 |
| M5 — Optional | Embedded llama.cpp runtime, model manager, batch UI | 💤 |

Full plans: [`docs/OPTION_C_LOCAL_COMPANION_PLAN.md`](docs/OPTION_C_LOCAL_COMPANION_PLAN.md) ·
[`docs/COMPANION_GITHUB_RELEASE_PLAN.md`](docs/COMPANION_GITHUB_RELEASE_PLAN.md)

## Install (v0.1 — unsigned)

Grab the artifact for your platform from the Releases page:

- **Windows** — `.msi` (all users) or `.exe` (current user)
- **macOS** — `.dmg` (universal: Intel + Apple Silicon)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

Unsigned first releases may trigger a one-time security notice:

- **macOS**: right-click the app ▸ **Open** (once), or System Settings ▸ Privacy & Security ▸ *Open Anyway*.
- **Windows SmartScreen**: *More info* ▸ **Run anyway**. Signed installers land at M4.

## Development

```bash
pnpm install
pnpm tauri dev          # dev window with hot reload
pnpm tauri build        # local release build
```

Requirements: Rust stable, Node 20 + pnpm; Linux additionally needs
`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.

## Release flow

Push a tag → three OS runners build in parallel → a **draft** GitHub Release appears
with all installers. QA it (see repo plan §9), then press **Publish**.

```bash
git tag v0.1.1 && git push origin v0.1.1
```

## License

MIT — see [LICENSE](LICENSE). AMTA brand assets are excluded (see NOTICE in LICENSE file).
