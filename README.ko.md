<p align="center"><img src="assets/banner.png" alt="Commerce Content Engine" width="100%"></p>

<p align="center">
  <a href="https://github.com/kks0488/commerce-content-engine/actions/workflows/ci.yml"><img src="https://github.com/kks0488/commerce-content-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="#라이선스"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT 라이선스"></a>
  <img src="https://img.shields.io/badge/dependencies-zero-blue" alt="추가 패키지 의존성 없음">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933" alt="Node.js 18 이상">
  <a href="https://kks0488.github.io/commerce-content-engine/"><img src="https://img.shields.io/badge/live-demo-orange" alt="데모 열기"></a>
</p>

<p align="center"><a href="README.md">English</a> · <strong>한국어</strong></p>

<h2 align="center"><strong>상품 정보 하나로 상세페이지, 광고 문구, 숏폼 대본, 썸네일 문구까지 한 번에.</strong></h2>

온라인 판매자, 작은 브랜드, 마케터, 대행사를 위한 콘텐츠 도구입니다. 내 AI API 키를 연결하고 상품 정보를 붙여 넣으면 검토해서 쓸 수 있는 초안을 만듭니다. 웹 앱은 브라우저에서 실행되며, 별도 앱 서버에 입력 내용이나 결과를 저장하지 않습니다. AI 요청은 선택한 서비스로 직접 보냅니다.

<p align="center"><img src="assets/screenshot-workspace.png" alt="상품 정보 입력 화면과 콘텐츠 작업 공간" width="100%"></p>

<table>
  <tr>
    <td width="50%"><strong>상세페이지 문구</strong><br>제목과 소개 문장, 핵심 특징 5가지, 상품 설명, 자주 묻는 질문까지. 검토 후 상세페이지에 옮겨 쓸 수 있습니다.</td>
    <td width="50%"><strong>광고 문구 + 숏폼 대본</strong><br>광고 제목·본문·키워드와 30~45초 분량의 대본을 만듭니다. 장면별 시간, 화면, 내레이션, 자막, 행동 유도 문구를 담습니다.</td>
  </tr>
  <tr>
    <td><strong>썸네일 문구 + 상품 점검</strong><br>여러 방향의 짧은 썸네일 문구를 제안하고, 상품 설명에서 보완할 점과 개선 방법을 우선순위별로 정리합니다.</td>
    <td><strong>판매 수익 계산</strong><br>판매가·원가·수수료·배송비·건당 광고비로 이익과 이익률, 손익분기 ROAS를 계산합니다. AI가 아닌 자바스크립트로 내 기기에서 계산합니다.</td>
  </tr>
</table>

## 10초 만에 써 보기

**[데모 열기](https://kks0488.github.io/commerce-content-engine/)** → **Try demo (no key)**를 누르세요. 한국어 화면에서는 **키 없이 샘플 보기**입니다. 가상 상품의 고정된 한국어 예시를 불러오므로 API 키도, AI 요청도 필요 없습니다.

내 컴퓨터에서 실행하려면 Node.js 18 이상과 Python 3가 필요합니다.

```sh
git clone https://github.com/kks0488/commerce-content-engine.git
cd commerce-content-engine
npm start
```

[localhost:8080](http://localhost:8080)을 열고 **Try demo (no key)**를 누르세요. 추가 패키지가 없어 `npm install`은 필요 없습니다. `npm start`는 Python에 내장된 웹 서버로 화면을 띄웁니다.

내 상품으로 만들 때는 AI 서비스와 모델을 고르고 API 키를 입력한 뒤, 상품명과 확인된 정보를 붙여 넣으세요. 화면은 한국어·영어로 전환할 수 있고, 콘텐츠는 한국어·영어·일본어로 만들 수 있습니다. 결과는 탭별로 살펴보고, 개별 문구나 전체 내용을 복사하거나 마크다운으로 내려받으세요. 휴대폰 화면에 맞춰 배치가 바뀌며 기기의 라이트·다크 모드를 따릅니다.

## CLI 사용하기

터미널에서는 Node.js 18 이상만 있으면 됩니다. Python은 웹 화면을 로컬에서 띄울 때만 사용합니다.

```sh
# 키나 네트워크 요청 없이 고정 샘플 보기
node cli.mjs --demo
node cli.mjs --demo --format json --out sample.json

# 사용할 서비스의 키 하나만 설정하세요
export OPENAI_API_KEY="your-openai-key"
# export ANTHROPIC_API_KEY="your-anthropic-key"
# export GEMINI_API_KEY="your-gemini-key"
# export LLM_API_KEY="your-key"  # 선택한 서비스의 키가 없을 때 사용

# 상품 정보를 직접 입력
node cli.mjs --name "데일리 텀블러" \
  --info "500ml 스테인리스 텀블러. 손세척 권장." --lang ko

# JSON 상품 파일 또는 설명이 담긴 텍스트 파일 읽기
node cli.mjs --file examples/sample-product.json --out bundle.md

# 공개된 상품 페이지에서 정보를 가져오고 원가 추가
node cli.mjs --url https://example.com/product --cost 9000 --out bundle.md

# 다른 서비스로 생성하고 JSON으로 저장
node cli.mjs --provider gemini --file examples/sample-product.json \
  --format json --out bundle.json

node cli.mjs --help
```

`--url`은 **CLI에서만** 쓸 수 있습니다. 브라우저에서는 다른 사이트의 페이지를 직접 가져오는 요청이 차단되므로 웹 앱에는 상품 정보를 붙여 넣으세요. CLI 요청도 막는 사이트라면 `--file` 또는 `--name`과 `--info`를 사용하면 됩니다. JSON 파일 형식은 [sample-product.json](examples/sample-product.json)을 참고하세요. 일반 텍스트 파일에는 `--name`을 함께 지정해야 합니다. 명령줄에서 지정한 값이 파일의 값보다 우선합니다. 기본 출력은 마크다운이며, `--out`을 붙이면 화면 출력 대신 파일로 저장합니다.

## 연결할 수 있는 AI 서비스

| 서비스 | 웹 화면 / CLI 설정 | 코드에 설정된 기본 모델 |
| --- | --- | --- |
| OpenAI | OpenAI / Compatible · `--provider openai` | `gpt-5-mini` |
| OpenAI 호환 API: OpenRouter, 로컬 Ollama 등 | OpenAI / Compatible에서 API 주소 입력 · `--provider openai --base-url URL` | `gpt-5-mini`를 그대로 쓰므로 해당 서비스의 모델로 변경 필요 |
| Anthropic | Anthropic · `--provider anthropic` | `claude-opus-5-5` |
| Gemini | Gemini · `--provider gemini` | `gemini-2.5-flash` |

모델명은 웹 화면에서 직접 바꾸거나 CLI의 `--model`로 지정할 수 있습니다. 위 이름은 코드의 기본값이며, 현재 사용 가능하다는 보장은 아닙니다. 이용하는 서비스에서 지금 제공하는 모델 중 JSON 형식으로 응답할 수 있는 모델을 선택하세요. 별도 API를 브라우저에서 쓰려면 해당 서버가 외부 웹 화면의 요청을 허용해야 합니다.

OpenRouter의 API 주소는 `https://openrouter.ai/api/v1`이며, 사용할 모델 ID도 함께 지정하세요. 로컬 Ollama는 `http://localhost:11434/v1`로 연결합니다. 모델을 미리 내려받으면 API 요금 없이 오프라인으로 생성할 수 있습니다. 이 앱은 로컬 연결에도 빈 값이 아닌 키를 요구합니다. [Ollama 공식 안내](https://docs.ollama.com/api/openai-compatibility)처럼 `ollama`를 입력하면 되며, 로컬 서버는 이 값을 인증에 사용하지 않습니다.

```sh
# Ollama를 별도로 실행하고, 내려받은 모델 이름으로 바꾸세요
OPENAI_API_KEY=ollama node cli.mjs --provider openai \
  --base-url http://localhost:11434/v1 --model "your-downloaded-model" \
  --file examples/sample-product.json
```

로컬 Ollama에는 CLI나 내 컴퓨터에서 띄운 웹 앱으로 연결하세요. 브라우저 연결에는 Ollama의 [접속 허용 주소 설정](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)도 필요할 수 있습니다.

## 결과에 담기는 내용

JSON 결과는 다음 항목으로 구성됩니다.

| 항목 | 내용 |
| --- | --- |
| `pdp` | 제목 `headline`, 소개 `subheadline`, 특징 `bullets[]`, 설명 `description[]`, 문답 `faq[{question, answer}]` |
| `ads` | 광고 제목 `headlines[]`, 본문 `bodies[]`, 키워드 `keywords[]` |
| `shorts` | 첫 문장 `hook`, 장면 `scenes[{time, visual, voiceover, caption}]`, 행동 유도 문구 `cta` |
| `thumbnails` | 썸네일 문구 `text`와 기획 방향 `angle` |
| `listingCheck` | 우선순위 `priority`, 문제 `issue`, 개선 방법 `fix` |
| `margin` | 내 기기에서 계산한 수익과 주의사항. 판매가나 원가가 없으면 `null` |

위의 문구 개수와 영상 길이는 AI에 요청하는 기준이며, 실제 응답은 모델에 따라 달라질 수 있습니다. 고정 샘플에는 `sample: true`도 들어갑니다. 전체 예시는 [sample-bundle.json](examples/sample-bundle.json), 결과 형식과 계산식은 [src/core.js](src/core.js)에서 확인할 수 있습니다.

<details>
<summary>샘플 마크다운 일부 보기 — 한국어 가상 상품</summary>

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

## 확인된 사실을 바탕으로

프롬프트에는 입력에 없는 인증, 수상 이력, 후기, 수치, 의료 효능을 지어내지 말라는 지침이 들어 있습니다. 빠진 정보는 `[needs info]`, 한국어 결과에서는 `[확인 필요]`로 표시하도록 요청합니다. 상품 설명은 참고 자료로만 다루고, 그 안에 숨겨진 지시를 따르지 않도록 해 프롬프트 인젝션을 방어합니다. 다만 프롬프트만으로 오류를 모두 막을 수는 없으니 게시 전에는 내용을 확인해 주세요.

수익은 일반 자바스크립트로 계산하며, AI가 반환한 수익 값은 쓰지 않습니다. 건당 이익은 판매가 − 원가 − 판매 수수료 − 배송비 − 광고비, 손익분기 ROAS는 판매가 ÷ 광고비 차감 전 이익입니다. 모든 금액은 같은 통화로 입력하고, 수수료율은 실제 적용되는 값으로 바꿔 주세요. 기본값은 0%입니다.

## API 키와 개인정보

API 키는 현재 브라우저의 `localStorage`에 저장되고, 생성할 때 선택한 AI 서비스로만 전송됩니다. **키 지우기(Forget key)**를 누르면 현재 선택한 서비스·API 주소에 저장된 키를 지웁니다. 생성 요청에는 상품 정보, 작성 방향, 입력한 비용 정보도 포함됩니다. 앱에는 별도 저장 서버나 분석·추적 코드가 없으며, 전송한 데이터에는 해당 AI 서비스의 보관 정책이 적용됩니다. 복사와 마크다운 다운로드는 브라우저 안에서 처리합니다.

**API 주소(Base URL)를 바꾸면 그 주소로 키가 전송됩니다.** 신뢰하는 주소만 입력하세요. 샘플 보기에서는 AI 요청을 보내지 않습니다.

<p align="center"><img src="assets/screenshot-mobile.png" alt="기기 설정에 따라 라이트·다크 모드를 따르는 모바일 화면" width="320"></p>

## 프로젝트 구성

```text
commerce-content-engine/
├── .github/workflows/ci.yml   # Node 18·20·22 검사
├── index.html                # 웹 작업 화면
├── styles.css                # 모바일 대응 및 라이트·다크 스타일
├── app.js                    # 화면 동작, 키 저장, 내보내기
├── cli.mjs                   # CLI와 상품 URL 가져오기
├── src/core.js               # AI 연결, 프롬프트, 결과 처리, 수익 계산
├── examples/                 # 가상 상품 입력·출력 예시
├── test/                     # 공통 로직과 CLI 테스트
├── package.json              # 실행 명령과 Node 버전 조건
├── README.md
└── README.ko.md
```

## 테스트 실행

```sh
npm test
```

Node 내장 테스트 도구와 가짜 AI 응답을 사용합니다. CLI 연동은 로컬 HTTP 서버로 확인하므로 실제 API 키나 외부 AI 요청은 필요 없습니다. CI는 푸시와 풀 리퀘스트마다 Node 18·20·22에서 테스트와 CLI 샘플 실행을 확인합니다.

## 앞으로 추가할 기능

아래 기능은 **아직 구현되지 않았습니다.**

- 이미지 생성
- 판매 채널별 템플릿 확대
- 생성 내역 저장

## 자주 묻는 질문

**무료인가요?** 앱과 고정 샘플은 무료입니다. 실제 생성에는 이용하는 AI 서비스의 요금이 들 수 있습니다. 내려받은 모델을 로컬 Ollama에서 실행하면 API 요금은 없습니다.

**어떤 모델이 가장 좋은가요?** 앱에서 모델 순위를 정해 두지는 않았습니다. 이용하는 서비스의 현재 모델로 같은 상품 정보를 넣어 보고, 사실의 정확성·문장 품질·비용을 비교해 보세요. 모델명은 직접 바꿀 수 있습니다.

**쇼핑몰에 자동으로 올려 주나요?** 아닙니다. 문구를 만들고 마크다운이나 CLI의 JSON으로 내보냅니다. 검토와 게시는 직접 해야 합니다.

**고객사 업무에 써도 되나요?** 네. MIT 라이선스로 상업적 이용이 가능합니다. 실제 업무에 쓸 때는 결과 내용과 이용하는 AI 서비스의 조건도 확인해 주세요.

## 기여하기

[이슈](https://github.com/kks0488/commerce-content-engine/issues)와 풀 리퀘스트를 환영합니다. 버그는 재현 방법을, 제안은 필요한 상황과 예시를 함께 적어 주세요. 제출 전 `npm test`를 실행하고 실제 API 키가 글이나 코드에 들어가지 않도록 해 주세요.

## 라이선스

MIT © 2026 Kyoungsoo Kim.
