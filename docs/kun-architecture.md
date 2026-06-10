# Kun 단일 런타임 아키텍처

DeepSeek GUI Codex 한국어 튜닝판은 하나의 로컬 agent 런타임만 사용합니다. 그 런타임이 **Kun**입니다.

## 핵심 원칙

- GUI는 agent loop를 직접 구현하지 않습니다.
- Renderer와 Main process는 Kun HTTP/SSE API만 호출합니다.
- Code, 쓰기, 휴대폰 연결, 예약 작업은 모두 같은 Kun 경계를 사용합니다.
- CodeWhale/Reasonix 같은 예전 provider 전환 UI는 제품 표면에 다시 추가하지 않습니다.
- 설정은 `agents.kun` 아래로 수렴합니다.

## 구조

```text
Renderer (React)
  -> preload IPC bridge
  -> Main process runtime host
  -> kun serve (HTTP + SSE)
  -> AgentLoop
  -> ModelClient / ToolHost / Store adapters
```

## 주요 API

- `GET /health`
- `GET /v1/threads`
- `POST /v1/threads/{id}/turns`
- `GET /v1/threads/{id}/events`
- `POST /v1/threads/{id}/fork`
- `POST /v1/sessions/{id}/resume-thread`
- `POST /v1/approvals/{id}`
- `POST /v1/user-inputs/{id}`
- `GET /v1/usage`
- `GET /v1/runtime/info`
- `GET /v1/runtime/tools`

## 모델 provider

Kun은 모델 호출을 adapter로 분리합니다.

- DeepSeek 호환 API client
- Codex OAuth client

GUI의 provider 설정은 Kun CLI 인자와 환경 변수로 전달됩니다. Codex OAuth는 `~/.codex/auth.json`의 access token/refresh token을 사용합니다.

## 캐시와 token ROI

Kun은 cache-first agent loop를 지향합니다.

- 안정적인 system prompt prefix 유지
- tool schema canonical sort
- append-only session log
- context compaction
- cache hit/miss telemetry
- 긴 tool result와 반복 출력을 모델 요청 경계에서 정리

목표는 token을 반복 prefix나 불필요한 tool catalog에 쓰지 않고, 요구사항, 코드, 결정, 결과에 쓰는 것입니다.

## 금지되는 방향

- 새 agent switcher 추가
- Kun 외 별도 runtime process 추가
- runtime diagnostics를 사용자용 핵심 UI로 복구
- 중국어 전용 UI/문서/로케일 재추가
- 저장 settings에 `agents.kun` 외 legacy provider 구조를 다시 저장

## 검증

```bash
npm run typecheck
npm test
npm run build
```

수동 smoke:

1. 코드 작업대에서 thread 생성과 streaming reply 확인
2. 파일 변경 diff 확인
3. 도구 승인/거절 확인
4. 쓰기 작업대 inline assistant 확인
5. Codex OAuth provider 선택 후 Kun 실행 인자 확인
