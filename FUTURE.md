# FUTURE

목표: 완전한 서버사이드 RisuAI/PocketRisu 호환 채팅 앱.
호환 기준은 PocketRisu 구현이며, 포팅한 동작은 `server/test/pocketrisu-parity` 오라클 테스트로 검증한다.

## 할 일

### 1. Lua 트리거 다중 실행

- [ ] 카드/모듈의 `triggerlua` 효과를 모두 보존하고 PocketRisu와 같은 순서로 전부 실행한다.
      현재 `normalizeLuaTriggers`(`server/src/services/prompt/risu.ts`)는 첫 번째 Lua 트리거만
      `luaScript`로 꺼내고 나머지는 경고와 함께 실행하지 않는다.
- [ ] 다중 스크립트를 저장할 수 있도록 스키마(`luaScript` 단일 필드)를 바꾸고 마이그레이션을 생성한다.
- [ ] 편집 UI(`web/src/components/app/settings/modules/lua-section.tsx`, 캐릭터 편집기)에서 여러 스크립트를 다룬다.
- [ ] export 시 `mergeLuaTriggers`가 모든 Lua 트리거를 원래 위치에 되돌려 쓰는지 확인한다.

범위 밖: V1/V2 블록 트리거. 지금처럼 원본(`rawTriggers`)만 보존하고 실행하지 않는다.

### 2. 실제 토크나이저 포팅

- [x] RisuAI/PocketRisu `tokenizer.ts`를 `server/src/services/tokenizer/`로 포팅한다.
      어휘 파일은 RisuAI `public/token/`에서 gzip으로 `server/assets/tokenizers/`에 복사했고(`SOURCES.md`),
      RisuAI에만 있는 `deepseek-v4`/`glm4`/`glm5`도 포함한다.
      Gemma는 RisuAI처럼 `llama3.json`을 쓰며, `@huggingface/transformers` 없이 같은 토큰 ID가 나온다.
- [x] `글자 수 / 3` 추정치를 모두 교체한다(컴파일러, 두 로어북, HypaMemory V3, 미리보기).
- [x] 컴파일러의 토큰 계산을 `sendChat`대로 포팅한다: 템플릿 카드별 1차 계산, 메시지당 추가 토큰(GPT 5, 그 외 3과 이름),
      `[Start a new chat]` 미계산, 재확인 단계의 `maxContext` 비교.
- [x] 토크나이저 선택: 모델 프리셋 `tokenizer` → PocketRisu 프로필 `recommendedTokenizer` → 모델 목록 기본값.
      PocketRisu는 `tokenizerOverride`를 UI에만 두고 계산에는 쓰지 않는데, Malang은 주석에 적힌 의도대로 적용한다.
- [x] 어휘 파일을 서버 번들과 Docker 이미지에 포함한다(`@dqbd/tiktoken`은 wasm 경로 때문에 external).
- [x] parity 시나리오에 한국어 기록 자르기와 로어북 토큰 예산을 추가한다(시나리오 `context` 예산).
- [ ] Google `countTokens` API로 세는 PocketRisu `googleClaudeTokenizing` 옵션은 포팅하지 않았다.
- [ ] 로컬 GGUF(`LLMTokenizer.Local`)와 플러그인 커스텀 토크나이저는 해당 기능이 없어 cl100k로 센다.

### 3. 정규식 엔진을 PocketRisu 구현 하나로 통일

- [x] `editinput`/`editoutput`도 `pocketrisu/scripts.ts`(`processScripts`)를 쓴다.
      chatID는 PocketRisu와 같이 입력은 -1, 출력은 새 메시지의 `chat.message` 인덱스다.
- [x] PocketRisu `processScriptFull`의 `@@repeat_back`(`end`/`start`/`end_nl`/`start_nl`)을 포팅한다.
- [x] 정규식 미리보기 API(`POST /prompt-presets/regex-preview`)도 같은 구현을 쓴다.
- [x] 구 엔진 `regex-runtime.ts`와 `regexTemplateContext`를 제거한다.
- [ ] `editinput`/`editoutput` parity 시나리오를 오라클에 추가한다.
- [ ] `@@inject`가 `editdisplay`에서 저장된 메시지를 덮어쓰는 PocketRisu 부작용은 아직 따라 하지 않는다.
      표시 처리 중 DB를 고치게 되므로 따라 할지 정해야 한다.

`@@emo`는 감정 이미지를 지원하지 않으므로 아무 동작도 하지 않는다.

### 4. 이어쓰기 (continue)

- [x] `GenerationRequestSchema`에 `mode: 'continue'`를 추가한다.
- [x] PocketRisu `sendChat({ continue: true })`를 포팅한다(`index.svelte.ts`, UI 조건은 `DefaultChatScreen.svelte`).
    - 조건: 인사말을 뺀 채팅이 2턴 이상이고 마지막이 캐릭터 메시지일 때만 허용한다.
    - 프롬프트: 마지막 캐릭터 메시지를 그대로 기록에 둔다. GPT/Claude/OpenRouter 계열만 `postEverything`에
      `[Continue the last response]` 시스템 턴을 기록 예산 계산 뒤에 추가한다(재확인 단계에서만 계산됨).
    - 출력: 기존 내용 + 새 출력을 `trim`한 뒤 Lua `editOutput` → `editoutput` 정규식으로 처리해 같은 메시지를 덮어쓴다.
      스트리밍 중에도 기존 내용 뒤에 이어 붙여 저장한다. `onStart`/`onOutput`은 일반 생성처럼 실행하고 입력 단계는 건너뛴다.
    - `reformatContent`의 `trim`은 일반 답변에도 적용한다(PocketRisu와 동일).
- [x] 생성 기록: 이어쓰기는 같은 메시지에 새 생성 기록을 남긴다(`outputText`는 새 출력, `processedOutputText`는 합친 결과).
      이전 기록을 고르면 이어쓰기 전 내용으로 돌아간다.
- [x] 메시지 도구에 "응답 계속하기" 버튼을 추가한다.
- [x] parity 시나리오(`continue-last-response`, `continue-korean-history-trimming`)를 추가한다.
      오라클이 Gemini 프리셋만 써서 `[Continue the last response]` 추가는 컴파일러 단위 테스트로 검증한다.
- [ ] PocketRisu와 다르게 둔 부분: 기본값인 `useSayNothing`이 켜져 있으면 PocketRisu는 이어쓰기 전에 `*says nothing*`
      사용자 메시지를 넣고 그 메시지에 출력을 이어 붙인다(사용자 메시지가 망가지는 버그). Malang은 이 동작을 따르지 않는다.
      실패한 이어쓰기는 메시지를 `failed`로 바꾸지 않고 원래 상태로 두어 채팅에서 빠지지 않게 한다.
- [ ] 자동 이어쓰기(`autoContinueChat`, `autoContinueMinTokens`)와 `removeIncompleteResponse` 설정은 아직 없다.
- [ ] NovelAI/NovelList/Horde 등 텍스트 완성 프로바이더는 PocketRisu `stringlize*` 형식(이어쓰기 시 `{{char}}:` 생략 등)을
      포팅하지 않아 모든 요청을 `role: content`로 보낸다.

### 5. Bias (로짓 바이어스)

- [x] 프리셋 `bias`(PocketRisu `db.bias`)와 캐릭터 `bias`(`extensions.risuai.bias`)를 각각 `bias_json` 컬럼에 저장하고
      import/export에서 되돌려 쓴다. 기존에 가져온 데이터는 원본에서 채우는 데이터 마이그레이션(`0002_backfill_bias`)으로 옮겼다.
- [x] `sendChat`대로 프리셋 → 캐릭터 순서로 합치고, `\n`/`\r`/`\\` 이스케이프를 푼 뒤 CBS를 처리한다(컴파일러, 미리보기의 `bias`).
- [x] 메인 채팅 요청에만 보낸다(`services/providers/bias.ts`). 보조 모델, 모델 체인, HypaMemory, Lua `LLM`은 PocketRisu처럼 보내지 않는다.
    - OpenAI 호환 chat completions: `[[id]]` 직접 지정, -101 강력 금지어(`strongBan`), 나머지는 문자열의 모든 토큰.
      Mistral, OpenRouter, NanoGPT, o 시리즈, PocketRisu 모델 프로필 바인딩에는 보내지 않는다(PocketRisu classic 경로의 동작).
    - NovelAI `logit_bias_exp`(토큰 시퀀스), NovelList `logit_bias`/`logit_bias_values`(원문 문자열).
- [x] 프리셋 편집기 파라미터 탭(-101~100, `bias.json` 가져오기/내보내기)과 캐릭터 편집기 고급 탭(-100~100)에 편집 UI를 추가한다.
- [ ] PocketRisu와 다르게 둔 부분: `strongBan` 캐시는 포팅하지 않았다(문자열만 키로 써서 토크나이저가 바뀌어도 재사용하고,
      캐시 적중 시 앞선 bias 항목을 버리는 버그가 있다). 빈 문자열 -101과 숫자가 아닌 `[[...]]`는 요청을 깨뜨리지 않도록 건너뛴다.
- [ ] 이미지 입력 모델 판정은 PocketRisu 모델 목록을 프로바이더/모델 ID 규칙으로 옮긴 것이라, `customFlags`나 목록에 없는 모델은 반영하지 않는다.
- [ ] 오라클은 Gemini 요청 본문만 캡처해서 bias parity 시나리오가 없다. 현재는 PocketRisu 코드 기준 단위 테스트(`test/providers/bias.test.ts`)로 검증한다.

## 이후 예정 (지금 범위 아님)

- 자동 번역: 외부 플러그인 시스템을 AI Chain처럼 가져와서 지원한다.
- 이미지 생성 백엔드: 포팅 예정. Lua `generateImage`(현재 항상 에러 문자열 반환)도 이때 연결한다.

## 지원하지 않음

- V1/V2 블록 트리거 실행 (원본 보존만)
- 그룹챗 (PocketRisu에서도 deprecated)
- 감정 이미지 자동 선택 (`{{emotion}}` 계열 CBS 렌더링은 유지)
- HypaMemory V2, SupaMemory (HypaMemory V3만 지원)
- TTS
