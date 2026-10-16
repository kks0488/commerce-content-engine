<p align="center"><img src="assets/banner.png" alt="Commerce Content Engine" width="100%"></p>

<p align="center">
  <a href="https://github.com/kks0488/commerce-content-engine/actions/workflows/ci.yml"><img src="https://github.com/kks0488/commerce-content-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/dependencies-zero-blue" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933" alt="Node.js >=18">
  <a href="https://kks0488.github.io/commerce-content-engine/"><img src="https://img.shields.io/badge/live-demo-orange" alt="Live demo"></a>
</p>

<p align="center"><strong>English</strong> · <a href="README.ko.md">한국어</a></p>

<h2 align="center"><strong>Paste one product. Get a detail page, ad copy, a shorts script and thumbnail text in one run.</strong></h2>

For online sellers, small brands, marketers and agencies: bring your own AI key and turn product facts into copy you can review and use. The web app runs in your browser, with no application server storing your inputs or outputs. Requests go directly to your chosen AI provider.

<p align="center"><img src="assets/screenshot-workspace.png" alt="Product inputs and the content workspace" width="100%"></p>

<table>
  <tr>
    <td width="50%"><strong>Detail page</strong><br>Headline, subheadline, five key points, product story and FAQ. Copy for your page, ready to review.</td>
    <td width="50%"><strong>Ads + shorts script</strong><br>Ad headlines, primary text and keywords, plus a 30–45 second script with timed scenes, visuals, voiceover, captions and a call to action.</td>
  </tr>
  <tr>
    <td><strong>Thumbnail text + listing check</strong><br>Short text options with creative angles, alongside prioritized issues and suggested fixes for your listing.</td>
    <td><strong>Margin snapshot</strong><br>Unit profit, margin and break-even ROAS computed locally in plain JavaScript, not by AI. Enter your price, cost, fees, shipping and ad spend per unit.</td>
  </tr>
</table>

## Try it in 10 seconds

Open the **[live demo](https://kks0488.github.io/commerce-content-engine/)** and click **Try demo (no key)**. It loads a fixed Korean example for a fictional product; no API request or key is needed.

Or run it locally with Node.js 18+ and Python 3:

```sh
git clone https://github.com/kks0488/commerce-content-engine.git
cd commerce-content-engine
npm start
```

Open [localhost:8080](http://localhost:8080) and click **Try demo (no key)**. No `npm install` is needed: there are no package dependencies. `npm start` uses Python's built-in static server.

For your own product, choose a provider and model, enter your API key, paste the product name and verified facts, then generate. The interface supports English and Korean; generated copy supports Korean, English and Japanese. Use the section tabs, copy individual cards or the full bundle, or download Markdown. The layout adapts to mobile and follows your system's light/dark preference.

## Use the CLI

Node.js 18+ is enough for the CLI; Python is only used by the local web server.

```sh
# Fixed sample, no key or network request
node cli.mjs --demo
node cli.mjs --demo --format json --out sample.json

# Set the key for your provider (only one is needed)
export OPENAI_API_KEY="your-openai-key"
# export ANTHROPIC_API_KEY="your-anthropic-key"
# export GEMINI_API_KEY="your-gemini-key"
# export LLM_API_KEY="your-key"  # fallback for the selected provider

# Paste product facts
node cli.mjs --name "Daily tumbler" \
  --info "500 ml stainless steel tumbler. Hand wash recommended." --lang en

# Read a JSON product file or a plain-text facts file
node cli.mjs --file examples/sample-product.json --out bundle.md

# Fetch a public product page and add your own cost
node cli.mjs --url https://example.com/product --cost 9000 --out bundle.md

# Choose another provider and export JSON
node cli.mjs --provider gemini --file examples/sample-product.json \
  --format json --out bundle.json

node cli.mjs --help
```

`--url` works **only in the CLI**: browsers block cross-site page fetches. In the web app, paste the product info. Some sites also block CLI fetching; use `--file` or `--name` with `--info` instead. JSON files use the fields in [sample-product.json](examples/sample-product.json); plain-text files need `--name`. Command-line values override file values. Markdown is the default output; `--out` saves it to a file instead of printing it.

## Providers

| Provider | Web / CLI selection | Default model in this code |
| --- | --- | --- |
| OpenAI | OpenAI / Compatible · `--provider openai` | `gpt-5-mini` |
| Any OpenAI-compatible endpoint, including OpenRouter and local Ollama | OpenAI / Compatible + Base URL · `--provider openai --base-url URL` | Inherits `gpt-5-mini`; change it to a model served by your endpoint |
| Anthropic | Anthropic · `--provider anthropic` | `claude-opus-5-5` |
| Gemini | Gemini · `--provider gemini` | `gemini-2.5-flash` |

Model names are editable in the web app and via `--model`. These are the defaults shipped in the code, not a guarantee of availability. Pick a current model from your provider that can return the requested JSON bundle. Custom browser endpoints must allow cross-origin requests.

For OpenRouter, use `https://openrouter.ai/api/v1` and your chosen model ID. Local Ollama uses `http://localhost:11434/v1`: local inference is free of API charges and works offline once you have downloaded a model. This app requires a nonempty key even locally; `ollama` is a placeholder that the local server ignores, as shown in [Ollama's compatibility docs](https://docs.ollama.com/api/openai-compatibility).

```sh
# Start Ollama separately; replace the model name with one you have downloaded
OPENAI_API_KEY=ollama node cli.mjs --provider openai \
  --base-url http://localhost:11434/v1 --model "your-downloaded-model" \
  --file examples/sample-product.json
```

Use the CLI or locally served web app for local Ollama. Browser access also depends on your endpoint's [allowed origins](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).

## What you get

The JSON bundle contains:

| Field | Contents |
| --- | --- |
| `pdp` | `headline`, `subheadline`, `bullets[]`, `description[]`, `faq[{question, answer}]` |
| `ads` | `headlines[]`, `bodies[]`, `keywords[]` |
| `shorts` | `hook`, `scenes[{time, visual, voiceover, caption}]`, `cta` |
| `thumbnails` | Options with `text` and `angle` |
| `listingCheck` | Fixes with `priority`, `issue` and `fix` |
| `margin` | Local calculations and warnings, or `null` without both price and cost |

The prompt requests the counts and script duration shown above; actual model output can vary. The fixed demo also includes `sample: true`. See [sample-bundle.json](examples/sample-bundle.json) for the complete example and [src/core.js](src/core.js) for the schema and calculations.

<details>
<summary>Excerpt from the demo Markdown (Korean fictional product)</summary>

```markdown
# 모루 데일리 텀블러

> Sample output · fictional product · no API call

Language: Korean | Channel: Naver Smartstore | Tone: friendly

## Product detail page

### 내 하루에 담는 작은 여유

모루 데일리 텀블러 500ml, 출근길부터 책상 위까지.

- 500ml 용량으로 챙기는 나의 음료
- 스테인리스 이중벽 보온·보냉 구조
- 차분한 무광 크림색
- 음료를 담기 편한 넓은 입구
- 분리형 뚜껑, 손세척 권장

바쁜 아침에도 좋아하는 음료를 챙겨 보세요. 모루 데일리 텀블러는 500ml 용량으로 일상에 함께합니다.

스테인리스 이중벽 보온·보냉 구조입니다. 지속 시간은 [확인 필요]이며, 사용 환경에 따라 달라질 수 있습니다.
```

</details>

## Honest by design

The prompt forbids invented certifications, awards, reviews, numbers and medical or efficacy claims that are absent from the input. Missing facts must be flagged as `[needs info]` or `[확인 필요]` for Korean output. Product text is treated as untrusted source material: the prompt tells the model to ignore instructions embedded in it. These are prompt guardrails; review generated claims before publishing.

Margin math runs in plain JavaScript and replaces any margin returned by the model. Unit profit is price − cost − platform fee − shipping − ads; break-even ROAS is price ÷ profit before ads. Use the same currency for every amount and enter your actual fee percentage (default: 0%).

## Privacy

Your API key stays in this browser's `localStorage` and is sent only to the chosen provider when generating. **Forget key** removes the saved key for the currently selected provider/endpoint. Product facts, directions and entered financial fields are sent to that provider for generation; the app has no backend storage, analytics or tracking scripts. The provider's own data policies apply. Copy and Markdown downloads happen in the browser.

**A custom Base URL receives your key.** Enter only an endpoint you trust. Demo mode makes no AI request.

<p align="center"><img src="assets/screenshot-mobile.png" alt="Mobile workspace with automatic light and dark appearance" width="320"></p>

## Project layout

```text
commerce-content-engine/
├── .github/workflows/ci.yml   # Node 18, 20 and 22 checks
├── index.html                # Browser workspace
├── styles.css                # Responsive light/dark styles
├── app.js                    # UI, key storage and export
├── cli.mjs                   # CLI and product URL fetching
├── src/core.js               # Providers, prompts, parsing and margin math
├── examples/                 # Fictional sample input and output
├── test/                     # Core and CLI tests
├── package.json              # Commands and Node requirement
├── README.md
└── README.ko.md
```

## Run tests

```sh
npm test
```

Tests use Node's built-in test runner and mock responses, including a local HTTP server for CLI integration. No real provider key or external AI request is needed. CI runs tests and the CLI demo on Node 18, 20 and 22 for pushes and pull requests.

## Roadmap

Not yet built:

- Image generation.
- More channel templates.
- Saved generation history.

## FAQ

**Is it free?** The app and fixed demo are free. Your AI provider may charge for generation; a downloaded model on local Ollama has no API fees.

**Which model is best?** There is no built-in ranking. Use a current model from your provider, try the same verified facts, and compare accuracy, writing quality and cost. The model field is editable.

**Does it post to my store?** No. It generates text and exports Markdown or CLI JSON. You review and publish it yourself.

**Can I use it for clients?** Yes. The project is MIT licensed and permits commercial use. Review the content and your AI provider's terms for your own work.

## Contributing

[Issues](https://github.com/kks0488/commerce-content-engine/issues) and pull requests are welcome. Include steps to reproduce a bug or an example of the change you need. Run `npm test` before submitting, and keep real API keys out of reports and patches.

## License

MIT © 2026 Kyoungsoo Kim.
