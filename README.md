# Commerce Content Engine
Turn seller-provided facts into a complete, editable commerce copy bundle.

- Write a product page with FAQ, ad copy, hashtags, a shorts script and thumbnail text.
- Check claims against your facts with Fact Guard, or compare short ads in a tournament.
- Export Markdown or JSON; calculate margin from your own prices and costs.

[Try the Nemotron demo](https://commerce-content-engine-nemotron.vercel.app) · [Bring your own key](https://kks0488.github.io/commerce-content-engine/) · [한국어](README.ko.md)

Quick start (Node 18+, no dependencies):

```sh
npm test
node cli.mjs --demo
# Hosted branch: reproduce one production round with 3 fictional products:
QA_OUTPUT=/tmp/cce-raw QA_SET=my-gate QA_ROUND=1 node scripts/quality-gate.mjs production
NEBIUS_API_KEY="$NEBIUS_API_KEY" node cli.mjs --provider nebius --name "Steel cup" --info "500 ml; stainless steel; removable lid; hand wash" --lang English
```

Set `NEBIUS_API_KEY` in your environment for live generation. `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` support compatible providers. `--demo` uses labeled offline fixtures. `node scripts/serve.mjs` starts the web app on the hosted branch. GitHub Pages sends your own key directly from the browser to your chosen provider.

```mermaid
flowchart LR
  Facts --> Draft[Nemotron writes] --> Guard[Super checks claims]
  Guard --> Revise[Revise flagged copy] --> Guard
  Guard --> Export[Bundle + source trace]
  Facts --> Variants[Nemotron drafts ads in batches] --> Gate[Super checks each ad] --> Tournament[Simulated buyer tournament]
```

**Nemotron on Nebius**

- The hosted bundle uses Nemotron Super for writing and factual review on Nebius Token Factory, with strict JSON Schema and bounded repairs. Korean/English guidance connects supplied facts to use moments; unknowns belong in seller listing checks.
- The tournament drafts and audits ads in batches of four, then compares eligible ads with Super and simulated buyer personas. Lightning drafting is supported; production currently selects Super for writing quality. Model calls, tokens and latency are visible; preferences are not customer research.
- Built during the hackathon: CLI, browser editor, Fact Guard, tournament, hosted demo and real-response regression checks. Accepted model JSON is preserved without FAQ replacement. AI review uses seller facts and still needs editorial judgment.

MIT © 2026 Kyoungsoo Kim. See [LICENSE](LICENSE).
