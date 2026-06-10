# Kun 설정 가이드

Kun은 DeepSeek GUI의 로컬 HTTP/SSE agent 런타임입니다. GUI는 설정 파일을 통해 Kun의 포트, 모델, provider, 권한, sandbox, token economy 옵션을 관리합니다.

## 설정 파일

GUI 설정 파일:

```text
macOS: ~/Library/Application Support/DeepSeek GUI/deepseek-gui-settings.json
Windows: %APPDATA%/DeepSeek GUI/deepseek-gui-settings.json
Linux: ~/.config/DeepSeek GUI/deepseek-gui-settings.json
```

Kun 런타임 설정 파일:

```text
~/.deepseekgui/kun/config.json
```

`agents.kun.dataDir`를 바꾸면 실제 Kun 설정 파일은 다음 위치에 생성됩니다.

```text
<dataDir>/config.json
```

## GUI가 관리하는 주요 필드

- `agents.kun.port`: 로컬 HTTP 포트
- `agents.kun.autoStart`: 앱 시작 시 Kun 자동 실행
- `agents.kun.providerId`: 사용할 모델 provider
- `agents.kun.model`: 기본 모델
- `agents.kun.approvalPolicy`: 도구 승인 정책
- `agents.kun.sandboxMode`: 파일/명령 권한 범위
- `agents.kun.modelProviderAuthType`: `api-key` 또는 `codex-oauth`
- `agents.kun.codexAuthPath`: Codex OAuth 인증 파일 경로

## Provider

기본 provider는 두 가지입니다.

```text
deepseek      DeepSeek API key
codex-oauth   Codex OAuth auth.json
```

Codex OAuth provider는 기본적으로 다음 파일을 읽습니다.

```text
~/.codex/auth.json
```

## CLI 예시

```bash
kun serve \
  --data-dir ~/.deepseekgui/kun \
  --port 8899 \
  --model deepseek-v4-pro \
  --model-provider-auth-type api-key
```

Codex OAuth:

```bash
kun serve \
  --data-dir ~/.deepseekgui/kun \
  --port 8899 \
  --model gpt-5.5 \
  --model-provider-auth-type codex-oauth \
  --codex-auth-path ~/.codex/auth.json
```

## 검증

```bash
npm run typecheck
npm test -- --run src/main/kun-process.test.ts src/shared/app-settings-provider.test.ts
npm run build
```
