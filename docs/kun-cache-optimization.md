# Kun 캐시 최적화

Kun의 캐시 최적화 목표는 숫자만 높이는 것이 아니라, 모델 요청 prefix를 안정적으로 유지해 같은 token 예산으로 더 많은 실제 작업을 처리하게 만드는 것입니다.

## 목표

- system prompt와 tool schema를 안정적으로 유지합니다.
- cache hit/miss 통계를 모델 provider가 제공하는 원본 필드에 맞춰 계산합니다.
- 긴 tool result와 반복 출력이 요청 context를 오염시키지 않게 합니다.
- GUI는 캐시 정책을 직접 구현하지 않고 Kun 런타임에 위임합니다.

## 안정 prefix

안정 prefix에는 장기적으로 변하지 않는 내용만 들어갑니다.

- Kun의 역할
- GUI와 runtime의 경계
- 도구 호출 규칙
- 응답 품질 기준

다음 값은 안정 prefix에 넣지 않습니다.

- 현재 시간
- workspace path
- 선택한 파일 조각
- 일회성 tool result
- 사용자별 임시 지시

## Tool schema

도구 schema는 모델 요청 전에 정렬해 fingerprint가 흔들리지 않게 합니다. MCP 도구가 많을 때는 전체 catalog를 매번 넣지 않고 검색/설명/호출 단계로 나누는 것이 좋습니다.

## Context compaction

긴 대화는 목표, 제약, 결정, 미해결 사항, 중요한 도구 결과를 남기고 압축합니다. 원본 로그는 보존하지만 모델에 보내는 context는 통제합니다.

## Codex OAuth와 캐시

Codex OAuth provider도 같은 Kun 요청 경계를 사용합니다. provider가 달라도 GUI는 동일한 thread/event/usage 구조를 소비합니다.

## 검증

```bash
npm test -- --run src/shared/app-settings-provider.test.ts src/main/upstream-models.test.ts
npm --prefix kun run test
```
