<p align="center">
  <img src="src/asset/img/deepseek.png" width="96" alt="DeepSeek GUI 아이콘">
</p>

# DeepSeek GUI Codex 한국어 튜닝판

[English](./README.en.md)

> DeepSeek GUI 오픈소스를 바탕으로 한국어 사용성, Codex OAuth, 로컬 앱 설치 흐름을 중심으로 튜닝한 데스크톱 AI 작업대입니다.

[GitHub 저장소](https://github.com/bssm-oss/deepseek-gui-codex) | [라이선스](./LICENSE)

## 프로젝트 고지

이 저장소는 기존 DeepSeek GUI 오픈소스를 기반으로 합니다. 원본의 데스크톱 작업대 구조와 Kun 런타임을 유지하면서, 한국어 환경에서 바로 쓰기 좋도록 내가 튜닝한 버전입니다.

주요 튜닝 내용은 다음과 같습니다.

- 기본 UI 언어를 한국어로 변경하고 중국어 로케일 선택지를 제거했습니다.
- README, 개발 문서, 보안/기여 문서를 한국어 중심으로 정리했습니다.
- DeepSeek API 키 방식은 유지하면서 Codex OAuth provider를 추가했습니다.
- 로컬 Codex 인증 파일(`~/.codex/auth.json`)을 사용해 Codex 모델을 선택할 수 있게 했습니다.
- 기본 로컬 provider를 Turbo Engine: SGLang(`gemma4-12b`)으로 두고, Ollama Gemma(`gemma4:12b`)를 선택 fallback으로 유지했습니다.
- macOS 로컬 설치본을 `/Applications/DeepSeek GUI.app`로 빌드/교체할 수 있게 검증했습니다.

## 무엇을 하는 앱인가

DeepSeek GUI는 개발자와 AI 작업자를 위한 로컬 데스크톱 작업대입니다. 작업 폴더를 선택하고, AI에게 구현/수정/검토 작업을 맡기며, 도구 호출과 파일 변경을 화면에서 확인할 수 있습니다.

이 튜닝판의 목표는 단순한 채팅 앱이 아니라 한국어 사용자가 바로 쓸 수 있는 로컬 AI 코딩/쓰기 도구입니다.

## 핵심 기능

- **코드 작업대**: 프로젝트 폴더를 기준으로 파일 읽기, 수정, 명령 실행, 변경 검토를 진행합니다.
- **쓰기 작업대**: Markdown 문서를 편집하고, 선택한 문장을 AI로 다듬거나 이어 쓸 수 있습니다.
- **Kun 런타임**: GUI와 AI agent loop 사이의 단일 HTTP/SSE 런타임입니다.
- **DeepSeek API**: 기존 DeepSeek API key 기반 모델 호출을 유지합니다.
- **Codex OAuth**: 로컬 Codex OAuth 인증을 읽어 Codex 모델 provider를 사용할 수 있습니다.
- **Turbo Engine: SGLang**: 로컬 SGLang/MLX 서버를 기본 provider로 사용하고, 필요 시 앱이 `jedisct1/gemma-4-12B-it-txt-mlx-8bit` 체크포인트를 `gemma4-12b` served model로 자동 확인/기동합니다.
- **Ollama Gemma 선택 옵션**: SGLang 대신 Ollama의 `gemma4:12b` 모델을 선택할 수 있습니다.
- **한국어 UI**: 기본 언어가 한국어이며 초기 설정과 설정 화면도 한국어를 우선합니다.
- **작업 승인/권한**: 파일 쓰기와 명령 실행 범위를 승인 정책과 sandbox 설정으로 제어합니다.
- **MCP/Skill 확장**: 로컬 Skill과 MCP 도구를 통해 agent 기능을 확장할 수 있습니다.
- **일정 작업/휴대폰 연결**: 예약 작업과 IM 연동 흐름을 Kun thread로 실행합니다.

## 데모

<p align="center">
  <a href="src/asset/img/code.mp4">
    <img src="src/asset/img/code.gif" width="410" alt="코드 작업대 데모">
  </a>
  <a href="src/asset/img/write.mp4">
    <img src="src/asset/img/write.gif" width="410" alt="쓰기 작업대 데모">
  </a>
</p>

<p align="center">
  <a href="src/asset/img/sdd.mp4">
    <img src="src/asset/img/sdd.gif" width="680" alt="요구사항과 계획 생성 데모">
  </a>
</p>

## Codex OAuth 사용

설정의 AI assistant provider에서 `Codex OAuth`를 선택하면 로컬 Codex 인증 파일을 사용합니다.

기본 경로:

```text
~/.codex/auth.json
```

앱은 다음 provider를 함께 유지합니다.

- `sglang-gemma`: 기본 로컬 SGLang Gemma 4 12B 방식
- `ollama-gemma`: 선택 가능한 Ollama Gemma 4 12B 방식
- `deepseek`: DeepSeek API key 방식
- `codex-oauth`: Codex OAuth 방식

Codex OAuth provider는 API key 입력 없이 로컬 인증 파일과 Codex backend API를 사용합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

요구 사항:

- Node.js 20 이상
- DeepSeek API key 또는 Codex OAuth 로그인 파일
- macOS 앱 패키징 시 Apple Silicon/Intel 환경에 맞는 Node native dependency 재빌드

## 빌드

```bash
npm run typecheck
npm test
npm run build
```

macOS arm64 앱 번들 생성:

```bash
npx --yes electron-builder@26.8.1 --config electron-builder.config.cjs --publish never --mac dir --arm64
```

로컬 설치본 교체:

```bash
rm -rf "/Applications/DeepSeek GUI.app"
cp -R "dist/mac-arm64/DeepSeek GUI.app" "/Applications/"
codesign --verify --deep --strict --verbose=1 "/Applications/DeepSeek GUI.app"
```

## 문서

- [개발 워크플로](docs/DEVELOPMENT.md)
- [기여 가이드](docs/CONTRIBUTING.md)
- [Kun 설정](docs/KUN_CONFIG.md)
- [Kun 아키텍처](docs/kun-architecture.md)
- [Kun 캐시 최적화](docs/kun-cache-optimization.md)
- [보안 정책](SECURITY.md)

## 라이선스와 출처

이 프로젝트는 원본 DeepSeek GUI 오픈소스의 라이선스 범위 안에서 튜닝한 버전입니다. 원본 프로젝트와 기여자들의 작업을 존중하며, 이 저장소에서는 한국어 환경, Codex OAuth, 로컬 배포 흐름에 맞춘 변경 사항을 별도 커밋으로 관리합니다.
