# 작업공간 개발과 검증

[English](development.md) · **한국어**

저장소 루트의 마켓플레이스·개발 파일이 하나의 독립된 설치 패키지를 감쌉니다. 호스트는 `plugins/pixelbank`를 설치하며 MCP 명령에서 `${PLUGIN_ROOT}/dist/index.js` 또는 `${CLAUDE_PLUGIN_ROOT}/dist/index.js`를 실행합니다. 실행 번들·스킬·도구 계약·고지 파일이 함께 설치됩니다.

| 위치 | 역할 |
| --- | --- |
| `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` | Codex와 Claude가 `plugins/pixelbank` 패키지를 찾도록 합니다. |
| `plugins/pixelbank/` | 패키지 설정, MCP 브리지, 스킬, 공개 계약과 커밋된 `dist/` 번들입니다. |
| `scripts/`, `.github/`, `.devcontainer/` | 작업공간 검증과 Bun 1.4.2 개발·CI 환경입니다. |
| `docs/` | 공개 유지보수 문서입니다. |

## 빌드와 검증

Dev Container에서 체크아웃을 열거나 로컬 Bun 1.4.2에서 실행합니다.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

빌드와 검증에는 `.bun-version`에 기록된 정확한 버전을 사용합니다. 루트의 `packageManager`, 패키지 요구 버전과 Dev Container 이미지가 이 버전과 일치합니다. 고객 설치 가이드에도 해당 버전의 설치 명령이 있습니다.

`Bun.build`가 독립 실행 번들을 만듭니다. `bun test`는 호환되는 `node:test` API를 포함해 테스트를 실행하며, `bun run --bun tsc --noEmit`으로 Node 실행 파일 없이 TypeScript 타입 검사를 유지합니다. Node 호환 import도 Bun에서 실행됩니다. 별도 프로세스 테스트도 Bun을 직접 실행합니다.

작업공간 명령은 패키지 디렉터리에서 실행됩니다. `build`는 실행 의존성을 번들에 포함하고 라이선스 고지를 유지하며 `dist/build-info.json`에 번들·계약 해시를 기록합니다. `validate`는 버전, 마켓플레이스 경로, 호스트 설정, 스킬, 고지와 해시를 확인합니다. `test`는 서명된 합성 인증 정보, 분리된 임시 인증 저장소, 권한에 따른 도구 호출과 `node_modules` 밖에서 실행되는 실제 표준 입출력 번들을 검증합니다.

CI는 Node가 없는 것을 확인한 뒤 같은 Dev Container 이미지에서 빌드와 테스트를 실행하며 발행 인증 정보를 제공하지 않습니다. 잠금 파일을 고정해 설치·재빌드한 결과가 커밋된 배포 파일이나 잠금 파일과 달라지면 실패합니다. 검증 컨테이너는 포트를 공개하거나 계정 인증 디렉터리를 마운트하지 않습니다. 이 테스트만으로 배포된 OAuth·클라우드 라우팅·유료 이미지 제공사의 실제 출력까지 검증한 것은 아닙니다.

분리된 서버를 명시적으로 구성할 때는 `PIXELBANK_API_BASE_URL`에 loopback 검색 주소를 지정할 수 있습니다. `PIXELBANK_CREDENTIALS_DIR`와 `PIXELBANK_AUTH_SCOPE`로 테스트 인증 정보를 분리합니다. 일반 홈 디렉터리 환경 변수는 바꾸지 않습니다. 운영 엔드포인트와 계정 경계는 클라이언트 계약에 고정돼 있습니다.

## 버전과 사용하는 서비스의 연동

작업공간·패키지·잠금 파일·호스트 설정·마켓플레이스의 버전 `0.2.0`을 일치시킵니다. 이름이나 파일 배치의 수정만으로 API가 바뀌거나 버전 상향이 필요하지는 않습니다. 플러그인 버전과 API 계약 버전은 별개입니다.

이 패키지를 사용하는 서비스는 정확한 저장소 커밋과 `plugins/pixelbank/dist/index.js`, `plugins/pixelbank/contracts/tools.json`의 해시를 고정합니다. 검증에는 저장소 루트 경로를 지정하고 그 아래 패키지를 찾도록 합니다. 설치된 실행 환경에는 패키지 디렉터리만으로 충분합니다.

로컬 검사와 커밋은 원격 발행 권한을 부여하지 않습니다. 기존 Git 훅과 보안 제어를 유지합니다. 푸시와 GitHub Release는 릴리스 컨테이너에서만 실행하며 [발행 절차](releases.ko.md)를 따릅니다. `bun run check:container`는 커밋된 소스를 Bun 이미지에서 검증하고 푸시에 필요한 검증 기록을 만듭니다.
