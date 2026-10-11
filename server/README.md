# Malang self-host chat backend

Malang 서버는 프론트엔드를 제공하지 않는 Hono JSON/SSE API다. SQLite 데이터와 가져온 자산은 `DATA_DIR` 아래에 영속 저장된다.

## 로컬 실행

```sh
export ADMIN_PASSWORD='a-long-initial-password'
export SESSION_SECRET="$(openssl rand -hex 32)"
export ALLOWED_ORIGINS='http://localhost:5173'
bun install
bun run --cwd server dev
```

프로덕션 번들은 다음과 같이 생성하고 실행한다.

```sh
bun run --cwd server build
bun run --cwd server start
```

`ADMIN_PASSWORD`는 최초 관리자 생성과 재시작 직후 비밀 저장소 잠금 해제에 사용된다. 이후에는
`PATCH /api/v1/auth/password`로 변경하며, 재시작 시 환경변수 값으로 비밀번호를 덮어쓰지
않는다. 환경변수가 변경된 비밀번호와 다르면 API 키는 관리자가 다시 로그인할 때 잠금 해제된다.

## Docker

```sh
cp .env.example .env
docker compose up --build -d
```

Ollama는 컨테이너에 포함되지 않는다. `PUT /api/v1/provider`에서 서버가 접근할 수 있는 고정
base URL과 model ID를 설정한다. Vertex는 설정 화면/API에 저장한 Vertex Express API key
또는 project/location과 ADC(`GOOGLE_APPLICATION_CREDENTIALS` 포함)를 사용할 수 있다.

Vertex API key는 평문으로 저장하거나 조회 응답에 반환하지 않는다. 관리자 로그인 암호에서
PBKDF2-SHA-256(600,000회)으로 파생한 키로 AES-256-GCM 암호화하며, 무작위 salt와 nonce를
사용한다. 관리자 암호 변경 시 저장된 API key도 같은 SQLite 트랜잭션에서 재암호화된다.

## 주요 동작

- API base: `/api/v1`
- liveness/readiness: `/health/live`, `/health/ready`
- 카드 import: multipart `file` 또는 raw body + `x-filename`
- 생성: `POST /conversations/:id/generations`의 `text/event-stream`
- 데이터: `${DATA_DIR}/data.sqlite`, `${DATA_DIR}/assets/{sha256}`

모든 `/api/v1` 엔드포인트는 로그인과 HttpOnly 세션 쿠키가 필요하며, 로그인만 예외다.
생성은 SSE 연결과 독립적으로 서버에서 끝까지 실행된다. 브라우저를 닫아도 결과는 DB에
저장되며, 명시적인 `DELETE /api/v1/generations/:id` 요청만 활성 생성을 취소한다.

## 프로젝트 구조

```text
server/
├── drizzle.config.ts
├── src/
│   ├── index.ts              # 서버 부팅
│   ├── app.ts                # 공통 middleware와 domain 조립
│   ├── config.ts             # Zod 환경 설정
│   ├── logger.ts             # Pino logger
│   ├── domains/              # Hono HTTP route
│   ├── services/
│   │   ├── app/              # 인증·카드·프리셋·생성 use case
│   │   ├── prompt/           # 템플릿·로어북·prompt compiler
│   │   └── providers/        # Vertex·Ollama adapter
│   └── db/
│       ├── db.ts             # SQLite/Drizzle 연결
│       ├── schema/           # Drizzle schema (feature별 파일)
│       ├── store.ts          # repository
│       ├── migrate.ts        # migration runner
│       └── migrations/       # versioned SQL
└── test/
```

HTTP domain은 요청 검증과 응답 조립만 담당하고, 실행 로직은 `services/`, 영속성은 `db/`로 위임한다.
