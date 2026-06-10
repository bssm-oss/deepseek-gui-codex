# Kun 기여 가이드

Kun은 DeepSeek GUI의 로컬 agent runtime 패키지입니다. `kun/` 아래 변경은 GUI보다 더 좁은 runtime 계약을 다루므로 구조를 지키는 것이 중요합니다.

## 설계 방향

Kun은 Ports & Adapters 구조를 따릅니다.

```text
contracts -> ports -> domain/services -> loop -> adapters/server
```

의존 방향은 안쪽 계약에서 바깥 adapter로 흐르며, core loop가 GUI 구현 세부 사항에 직접 의존하지 않아야 합니다.

## 변경 순서

1. HTTP/SSE 계약이 바뀌면 `contracts/`에 schema를 추가합니다.
2. 외부 의존성이 필요하면 `ports/`에 인터페이스를 둡니다.
3. 순수 로직은 `domain/` 또는 `services/`에 둡니다.
4. 실제 구현은 `adapters/`에 둡니다.
5. route는 `server/routes/`에서 연결합니다.
6. CLI 옵션은 `src/cli/`와 config loader에 함께 반영합니다.
7. 테스트를 추가합니다.

## 모델 client

모델 provider는 `ModelClient` adapter로 구현합니다.

- DeepSeek 호환 client
- Codex OAuth client

provider가 추가되어도 thread, turn, event, approval, usage 계약은 유지해야 합니다.

## 금지 사항

- GUI 전용 state를 Kun loop에 직접 넣지 않습니다.
- 두 번째 live runtime을 추가하지 않습니다.
- 테스트 없이 HTTP 계약을 바꾸지 않습니다.
- 중국어 전용 fixture나 문구를 새로 추가하지 않습니다.

## 검증

```bash
npm --prefix kun run typecheck
npm --prefix kun run test
npm --prefix kun run build
```
