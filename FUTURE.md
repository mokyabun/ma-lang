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

- [ ] `GenerationRequestSchema`(`shared/src/schemas/generations.ts`)에 `mode: 'continue'`를 추가한다.
- [ ] PocketRisu의 이어쓰기 흐름(원본 위치 확인 필요)을 포팅한다.
    - 마지막 캐릭터 메시지를 프롬프트에 어떤 형태로 넣는지(프리필/시스템 지시)
    - 생성 결과를 기존 메시지 뒤에 붙이는 방식과 `editoutput`/Lua `editOutput` 적용 범위
    - 프리필을 지원하지 않는 프로바이더에서의 동작
- [ ] 생성 기록(스와이프)과의 관계를 정한다: 이어쓴 결과가 같은 생성 기록을 갱신하는지, 새 항목인지.
- [ ] 채팅 UI에 이어쓰기 버튼을 추가한다.
- [ ] parity 시나리오를 추가한다.

### 5. Bias (로짓 바이어스)

- [ ] 프롬프트 프리셋의 `bias`를 파싱해 `GenerationParameters`로 옮긴다.
      `.risupreset` import 시 `bias`는 원본 프리셋에는 남아 있지만 파싱되지 않고, 편집 UI와 프로바이더 요청 어디에도 없다.
- [ ] PocketRisu처럼 문자열을 모델 토크나이저로 토큰 ID로 바꿔 `logit_bias`를 만든다(2번 토크나이저 작업 이후).
- [ ] 지원하는 프로바이더(OpenAI 호환 등)에만 보내고, 나머지는 PocketRisu와 같이 무시한다.
- [ ] 프리셋 편집기에 bias 목록 편집 UI를 추가하고 export 시 되돌려 쓴다.

## 이후 예정 (지금 범위 아님)

- 자동 번역: 외부 플러그인 시스템을 AI Chain처럼 가져와서 지원한다.
- 이미지 생성 백엔드: 포팅 예정. Lua `generateImage`(현재 항상 에러 문자열 반환)도 이때 연결한다.

## 지원하지 않음

- V1/V2 블록 트리거 실행 (원본 보존만)
- 그룹챗 (PocketRisu에서도 deprecated)
- 감정 이미지 자동 선택 (`{{emotion}}` 계열 CBS 렌더링은 유지)
- HypaMemory V2, SupaMemory (HypaMemory V3만 지원)
- TTS
