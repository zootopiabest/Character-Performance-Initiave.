# Character Performance Initiative (CPI)

> Division of Synthetic Personality Oversight. No scores. No puppeting. Just the receipts.

Standalone browser-based benchmark for testing how different LLMs portray the **same character card** in **identical, independent roleplay scenarios**. Not affiliated with Card Analyzer. No build step and no backend required for the UI.

## What's in v0.3.0
- Character-card import: V1/V2/V3 JSON, V2/V3 PNG embedded metadata, and Markdown/text. Explicitly extracts name, description, personality, depth/post-history prompt, example dialogue and character system prompt only. Deliberately excludes greetings, card scenario, creator notes, tags, and lorebook.
- **Editable field explorer:** collapse/expand every field independently and uncheck Include to exclude from prompts. Unchecking example dialogue does not erase it. The sample request, cost estimate, and run exports honor exclusions.
- PNG metadata import accepts `chara`/`ccv3` embedded in tEXt/zTXt/iTXt chunks. Plain images without card metadata cannot be reconstructed into card data.
- 12 included scenarios, custom scenarios, customizable lean roleplay baseline, and exact prompt preview.
- Multiple model instances (duplicates allowed), configurable repetitions/temperature/output tokens/concurrency.
- **OpenRouter browser** with searchable live catalog, developer filter, input and output prices per 1M tokens, sort options and context windows.
- **DeepSeek direct** model selection, custom model ID support and separate API key.
- **Custom OpenAI-compatible endpoints**: multiple tab-only connections with URL/key and custom model IDs; optional manual price for estimates.
- Raw side-by-side results, errors, cancellation, reported token/cost usage, Markdown/JSON exports.
- Collapsible What's New release notes nested by version; design and implementation rationale in `CLAUDE.md`.

## Run locally

```bash
npm run dev
# Browse http://localhost:4173
npm test
```

Node 18+ is only for local serving/tests. The deployed site is HTML/CSS/JavaScript modules and can run without Node.

## GitHub Pages
1. Commit/push these files to your `main` branch.
2. Open repository **Settings → Pages**. Under *Build and deployment*, choose **GitHub Actions** for the source.
3. Open the **Actions** tab and select **Test and deploy CPI to GitHub Pages** if you want to manually run the deployment. Normal pushes to `main` also trigger it.
4. Confirm a green deployment and use the URL displayed in **Settings → Pages**. It will be under `https://<owner>.github.io/<repository-name>/` unless a custom domain is configured.

The workflow runs `npm test`, then publishes only `index.html`, `styles.css` and `src/*.js` from a `public/` artifact. No source code build/bundler or GitHub repository secrets are necessary.

## API keys and provider compatibility
- Keys are entered **in the browser**, held in current-tab memory only, and never added to the GitHub repository, URL, report exports or cookies. Refreshing loses them.
- OpenRouter requests go to `https://openrouter.ai/api/v1/chat/completions`.
- Direct DeepSeek requests go to `https://api.deepseek.com/chat/completions`. Current official model examples: `deepseek-flash` and `deepseek-v4-pro`; you may type another ID. No fabricated direct DeepSeek price estimate is provided.
- Custom connections accept an OpenAI-compatible base URL (for example `https://my-server.example/v1`) and call `.../chat/completions`. HTTPS is required except for localhost. Optional blank keys are supported for local development servers.
- **Important: GitHub Pages is static.** A provider may reject direct browser requests because of CORS, despite correct API credentials. DeepSeek direct and custom API compatibility therefore depend on the server's CORS policy. CPI cannot bypass CORS and does not include a key-forwarding proxy. If a direct provider blocks browsers, use that model via OpenRouter or a **trusted relay you operate yourself**, not a random public proxy.
- Prices displayed for OpenRouter come from its current catalog and may change. Estimates use a rough input-token heuristic and ~350 generated tokens per response; manual custom rates are user supplied. Actual fees may be different. Where a provider omits `usage.cost`, the result shows that cost as unavailable.

## Testing philosophy
One scenario, one user turn, per model/repetition. Every trial gets only the same allowed card fields and the same editable baseline system instruction. The app collects evidence; it does not declare winners or hallucinate scores. LLM differences, context-role conventions, and stochastic sampling mean no benchmark is perfectly neutral.

See [`CLAUDE.md`](CLAUDE.md) for the exact rationale, security rules, architecture, limitations and roadmap. See the app's **What's New** panel for version history.
