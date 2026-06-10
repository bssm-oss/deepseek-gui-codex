# 보안 정책

DeepSeek GUI Codex 한국어 튜닝판을 안전하게 유지하는 데 도움을 주셔서 감사합니다.

## 지원 범위

보안 수정은 기본 브랜치의 최신 코드와 최신 릴리스에 우선 적용합니다. 오래된 버전은 상황에 따라 패치가 제공되지 않을 수 있습니다.

## 취약점 신고

보안에 민감한 문제는 공개 GitHub issue로 올리지 말아 주세요.

가능하면 다음 정보를 포함해 비공개로 신고해 주세요.

- 문제 설명
- 영향을 받는 버전, 커밋, 릴리스 태그
- 재현 절차 또는 proof of concept
- 영향 범위
- 가능한 완화 방법

신고 채널:

- GitHub Security Advisories
- 저장소 관리자에게 비공개 연락

## 응답 기준

- 새 신고는 가능한 한 빠르게 확인합니다.
- 범위에 포함되는지 triage합니다.
- 수정 또는 완화책이 준비될 때까지 공개 세부 정보는 제한합니다.
- 수정이 준비되면 릴리스 노트나 보안 공지를 통해 필요한 정보를 공유합니다.

## 신고 대상 예시

- 원격 코드 실행 또는 권한 상승
- sandbox 우회 또는 안전하지 않은 파일 접근
- API key, OAuth token, secret 유출
- updater, packaging, release integrity 문제
- bundled local service 또는 integration path 취약점
