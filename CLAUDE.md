# CLAUDE.md | Character Performance Initiative (CPI)

**Version:** 0.3.0 (2026-11-02)  
**Officially unserious designation:** Division of Synthetic Personality Oversight.

## Project identity and non-negotiable design
CPI is a standalone, static browser application to compare how **different LLMs portray the same character** in the same independent roleplay scenarios. It is **not Card Analyzer** and must not be merged into Analyzer 5.x. Character construction quality and performance under a model are different questions. CPI's result is evidence: raw response text, requested/resolved model, reported usage, and errors. **Do not silently invent grades, rewrite completions, or select a winner.**

All user-paid requests are explicit. No automatic retries, grading calls, or hidden second-model work. The benchmark's core test input is ONLY: selected name, description, personality, depth prompt, example dialogue, and character system prompt, plus the chosen neutral roleplay instruction and one scenario user message. Exclude greetings, first messages, card scenario, author notes and metadata. Repetition and duplicates are intentional, including two entries using the same model slug. No puppeting of the user in the baseline. Preserve the exact exported raw response.

## Modules
- `index.html`, `styles.css`: static responsive UI, nested release notes, model browser, direct/custom API controls.
- `src/app.js`: UI state, catalog filters, model instances, ephemeral connections, run queue, results and exports.
- `src/core.js`: pure allowlist character-card parser, included-field filter, prompt assembly, run plan, price estimate, summary and Markdown output.
- `src/png.js`: PNG embedded character metadata parser (chara/ccv3). Reads bytes locally, no external libraries, limited sizes, supports tEXt/zTXt/iTXt and older compressed payloads.
- `tests/png.test.mjs`: synthetic V2/V3 PNG fixtures, metadata stripping, compression, file dispatch and excluded-field checks.
- `src/openrouter.js`: OpenRouter model listing only; its chat calls now go through the shared provider transport.
- `src/providers.js`: OpenRouter, DeepSeek and custom OpenAI-compatible chat completion transports. No dependencies.
- `src/releases.js`: **single source of truth** for the public version label and nested "What's New" entries. Add new releases to the TOP, do not delete the historical release.
- `src/scenarios.js`: test inputs and baseline roleplay rules.
- `tests/*.test.mjs`: Node tests, no real paid API calls.
- `.github/workflows/pages.yml`: test and GitHub Pages static deployment.
- `scripts/serve.mjs`: local static server. Run `npm run dev` and `npm test`.

## Decision log (what changed AND why)

### 0.1.0 — Initial independent laboratory, 2026-11-02
1. Created a **new application** instead of adding another Card Analyzer tab. **Why:** card quality grading and character performance observation need different workflows and should remain independent.
2. Kept only the four permitted character fields. **Why:** the creator explicitly wants scenarios/greetings left out so the experiment measures how models interpret the underlying character, not whether the original opening prompt pre-answers the test.
3. Allowed multiple instances of the exact same model and repeated trials. **Why:** individual stochastic completions do not prove consistent portrayal.
4. Used a shared minimalist roleplay baseline and an inspectable exact message preview. **Why:** reduce experimental steering and make remaining steering visible. Minimal is not unbiased.
5. Kept results ungraded and exportable. **Why:** interesting plausible character inferences should not be penalized simply for extending unstated lore; a numerical judge can flatten those differences.
6. Made keys tab-memory-only. **Why:** the user is billed directly, and exporting or persisting secrets creates avoidable risk.

### 0.2.0 — Model flexibility and public deployment, 2026-11-02
1. **Version-nested collapsible release log, default collapsed.** **Why:** borrow the useful release-accountability pattern from Analyzer 5.x without filling the landing page with a wall of patch notes. New versions must remain individually collapsible; preserve history.
2. **Full OpenRouter catalog with searchable/paged results, developer filter, sortable input/output price, and context size.** **Why:** an autocomplete alone hides the available models and makes cost comparison cumbersome. Display provider-published prices as USD per million tokens; do not call them guaranteed charges.
3. **Direct DeepSeek selection, separate key and own endpoint.** **Why:** users should not need an OpenRouter middle layer to select a model for which they have direct credentials. DeepSeek currently documents `https://api.deepseek.com` and `deepseek-flash` / `deepseek-v4-pro`. These names may change: keep them editable and review provider docs before renaming. No invented live prices.
4. **Multiple named custom OpenAI-compatible connections plus arbitrary model IDs.** **Why:** local servers, self-hosted inference, proxy endpoints and unfamiliar models should be usable without code patches. They use `/chat/completions`; do not claim support for Anthropic or Gemini-native APIs until adapters exist.
5. **Provider-specific payloads and no leaked keys.** **Why:** `usage:{include:true}` is OpenRouter-specific; DeepSeek and unknown providers should not receive it. Credentials belong only in in-memory input/connection state; export model identifiers and connection *names*, not credentials. Empty keys allowed only for custom endpoints, for local servers without authentication.
6. **Custom HTTPS validation; allow plain HTTP only for localhost loopback.** **Why:** reject accidental credential exposure in userinfo/URL query or plaintext remote HTTP. A local server opened from HTTPS Pages may still fail due to mixed-content/private-network browser restrictions, so no guarantee is implied.
7. **Cost estimate leaves unpriced providers unknown, optional manually supplied price for custom models.** **Why:** guessed direct-API prices would be misleading and billing varies; reported usage cost is authoritative only when a provider sends it.
8. **GitHub Pages workflow uses staged static assets and tests before deploy.** **Why:** site works under a repo-specific subpath without bundling, backend, secrets, or dev scripts. The workflow must be selected as the Pages publishing source in repo Settings → Pages. Version bump + release note goes with any user-facing change.
9. **Explicit CORS limitation.** **Why:** Pages cannot provide a safe secret-holding server. Providers that reject browser-origin requests require a trusted user-controlled relay or compatible intermediary. Do NOT ship a public credential-forwarding proxy, spoof browser security, or hardcode a provider key in JS or GitHub Actions.

### 0.3.0 — Actual card imports and inspectable field isolation, 2026-11-02
1. **Full V2/V3 JSON extraction from canonical `data` fields.** **Why:** the original importer only handled generic text/JSON and merged personality into description. This made exported-card comparisons less reproducible and less transparent. Prefer `data` over duplicated root V1 fields. Retain V1 fallbacks where safe.
2. **Embedded PNG character cards (`chara`, `ccv3`; tEXt, zTXt and iTXt).** **Why:** PNG is a primary distribution format for character cards, and refusing V2 PNG made the benchmark inconvenient for its intended audience. Support conventional base64(JSON), raw JSON and legacy base64(zlib(JSON)); prefer V3 metadata if both exist. It works offline in the browser, not by uploading the image. Fail explicitly when metadata was stripped. This reads metadata, not the appearance of the character portrait. Max PNG 24 MB, chunks 8 MB and decompressed metadata 4 MB.
3. **Strict field allowlist (`name`, `profile` / description, `personality`, `depth`, `examples`, `system`).** **Why:** using a generic importer or a broad Markdown catch-all can inadvertently inject creator notes, greetings, scenarios, lorebook or image metadata. Never use a catch-all fallback for known structured headings or JSON. An unseen field cannot be silently introduced into prompts. The V2 `post_history_instructions` maps to *depth* but is not given magical after-history priority in a one-shot request.
4. **Personality separate from description.** **Why:** creators need to see exactly what will be sent and independently omit it if desired. Do not glue personality text into the description before presenting it. Older manual cards that only have `profile` still work.
5. **Nested collapsible field explorer with independent Include checkboxes.** **Why:** testing the same model with and without example dialogue (or depth/system/personality) is a core workflow, not a reason to edit or destroy the source card. All fields stay editable locally, even when unchecked. Default to included on every new import, then let the user opt out.
6. **Single `includedCard()` filter for preview, estimation, actual request and run snapshot.** **Why:** an unchecked field must *never* leak into a paid request or export. The app snapshots only selected fields at the beginning of a run, so in-progress edits cannot mutate test conditions. The source card stays in the editor; the exported benchmark captures only what was sent.
7. **Regression tests for forbidden data and PNG payload variants.** **Why:** silently including a greeting or failing a normal PNG invalidates the experiment. Build synthetic cards containing distinct forbidden marker strings and assert exclusion. No paid API required.

## Operational constraints and risks
- Test all providers with mocked `fetch` when changing request formatting. Live paid API integration is unverified until a user runs it. Do not overclaim browser CORS compatibility, especially for DeepSeek.
- The standard OpenAI-like protocol expects `POST {baseUrl}/chat/completions`. Custom connectors do not implement nonstandard schemas, OAuth, websockets, SSE or arbitrary headers. Do not describe them as universal API compatibility.
- Key values exist only in the tab session and are lost on refresh, including direct/custom connections. This is intentional, not a persistence bug.
- A paid call can still be billed after browser cancellation. No automatic paid retry or repair.
- Run settings and model objects are snapshotted. Never snapshot credentials. Keep model labels and prompts unchanged in an in-progress run.
- A provider's reported `usage.cost` is not fabricated. No cost is shown for missing usage.
- UI HTML assembled from user/model fields must always use `esc()` to avoid markup injection.
- Relative asset URLs are deliberate for GitHub Pages project paths; don't convert to absolute `/src/...` URLs.
- The linked repository was created by the user with the exact name `Character-Performance-Initiave.` (spelling and trailing dot included). Avoid assuming a cleaner repository slug or changing its name automatically.

## Deployment and testing
```
npm test
npm run dev        # http://localhost:4173
```
GitHub Pages: GitHub repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**. Push on `main` runs tests, stages only HTML/CSS/modules (no source secrets), uploads a Pages artifact and deploys. Check Actions and Settings → Pages for the authoritative live URL. `npm install` is not required.

## Next work, not yet shipped
- Multi-turn benchmark with explicitly documented user-message generation method.
- Saved benchmark histories without any keys; export/import round trips and safe optional persistence.
- Provider-specific error explanations and live end-to-end checks, especially CORS behavior.
- User annotations and blind comparisons, no implied model objective rankings.
- Additional real-world card import fixtures from different frontends, plus .charx if later requested. Synthetic V2/V3 PNG fixtures are shipped in tests.
- Optional user-owned authenticated relay implementation, only after explicit security design.
