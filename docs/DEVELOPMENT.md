# 개발 워크플로

이 문서는 DeepSeek GUI Codex 한국어 튜닝판의 개발 흐름, 브랜치 전략, 검증 기준을 정리합니다.

## 브랜치 기준

- `master`: 안정 브랜치
- `codex/*`: Codex 작업 브랜치
- 기능/수정 작업은 짧은 feature 브랜치에서 진행합니다.

## 권장 흐름

1. 최신 `master`를 기준으로 작업 브랜치를 만듭니다.
2. 변경 범위를 작게 유지합니다.
3. 사용자에게 보이는 문자열은 한국어 리소스를 먼저 갱신합니다.
4. 타입체크, 테스트, 빌드를 실행합니다.
5. 변경을 의미 있는 단위로 커밋합니다.
6. 대상 저장소에 push하고 PR을 엽니다.

## 필수 검증

```bash
npm run typecheck
npm test
npm run build
```

macOS 앱 변경이 있으면 다음도 확인합니다.

```bash
npx --yes electron-builder@26.8.1 --config electron-builder.config.cjs --publish never --mac dir --arm64
codesign --verify --deep --strict --verbose=1 "/Applications/DeepSeek GUI.app"
```

## 로컬 개발

```bash
npm install
npm run dev
```

Kun 런타임만 따로 확인할 때:

```bash
npm --prefix kun run typecheck
npm --prefix kun run test
npm --prefix kun run build
```

## PR 품질 기준

- 목적이 분명해야 합니다.
- UI/문구 변경은 한국어 리소스를 포함해야 합니다.
- 기존 DeepSeek API key 흐름을 깨지 않아야 합니다.
- Codex OAuth 변경은 로컬 `~/.codex/auth.json` 흐름을 고려해야 합니다.
- 테스트가 실패하면 원인을 PR에 명확히 남깁니다.
