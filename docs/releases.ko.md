# 컨테이너 푸시와 버전별 릴리스

[English](releases.md) · **한국어**

공개 대상은 `haandol/pixelbank-plugin`입니다. 모든 푸시와 GitHub Release는 `.devcontainer/release`로 빌드한 릴리스 컨테이너에서 실행합니다. 호스트에서 직접 하는 푸시는 저장소 훅이 거부합니다. 설정·검사·로컬 커밋만으로 푸시나 릴리스가 승인되는 것은 아닙니다.

## 각 단계의 역할

| 단계 | 실행 환경 | 검증 내용 |
| --- | --- | --- |
| `npm run check:container` | 커밋된 `HEAD`를 새로 내보낸 Node 24 검증 이미지(`.devcontainer/Dockerfile`) | 잠금 파일을 사용한 설치, 전체 `npm run check`, 재빌드 전후 커밋 파일 일치를 확인합니다. 성공하면 Git 공통 디렉터리에 소스 트리별 검증 기록을 만듭니다. |
| `bash scripts/container-git.sh push …` | Alpine Git·GitHub CLI 릴리스 이미지 | pre-push 훅이 푸시할 트리와 검증 기록을 비교합니다. `main`과 주석이 있는 `vX.Y.Z` 태그만 허용하며 삭제와 다른 참조는 거부합니다. |
| `bash scripts/container-release.sh vX.Y.Z` | 작업공간을 읽기 전용으로 마운트한 같은 릴리스 이미지 | 원격 태그가 로컬 주석 태그와 일치하고, 커밋이 원격 `main`에 있으며, 원격 검사가 성공했고 모든 설정의 버전이 맞는지 확인합니다. ZIP은 태그된 패키지로만 만듭니다. |

호스트는 GitHub CLI 인증 정보를 표준 입력으로 컨테이너에 전달합니다. 컨테이너 메모리에만 보관하며 이 저장소에 대한 HTTPS 요청에만 사용합니다. 토큰을 명령 인자·환경 파일·이미지·원격 URL·작업공간에 넣지 않습니다. 컨테이너는 읽기 전용 루트 파일시스템, 제거된 Linux 권한, 호스트 인증 디렉터리 없이 실행됩니다.

## `main` 푸시

```sh
npm run hooks:install          # 체크아웃마다 한 번만 실행하며 기존 훅 관리자를 유지합니다.
bash scripts/container-git.sh push -u origin main
```

같은 소스 트리와 검증 이미지에 대한 성공 기록이 없으면 `HEAD`를 다시 검증합니다. 무시되지 않은 미커밋 변경이 있으면 중단합니다. 원격 CI는 같은 검증 이미지를 독립적으로 실행합니다.

## 릴리스 발행

1. 작업공간·패키지·잠금 파일·호스트 설정·마켓플레이스의 버전을 일치시킵니다. `npm run validate`가 이를 확인합니다.
2. 릴리스 커밋을 `main`에 푸시하고 `verify` 검사 성공을 기다립니다.
3. 해당 커밋에 주석 태그를 만들고 푸시합니다. `git tag -a v0.1.1 -m "PixelbankStudio Plugin 0.1.1"` 다음 `bash scripts/container-git.sh push origin v0.1.1`을 실행합니다.
4. 무시된 `.release/notes-v0.1.1.md`에 사용자에게 달라진 점을 영어와 한국어로 작성합니다. 비공개 서비스 구현·운영 데이터·인증 정보·사용자 콘텐츠는 포함하지 않습니다. 이어서 `bash scripts/container-release.sh v0.1.1`을 실행합니다.

발행기는 소스 커밋과 ZIP SHA-256을 덧붙이고 `pixelbank-plugin-<version>.zip`, `SHA256SUMS`를 올립니다. 초안이 아닌지, 필요한 파일이 있는지, 인증 없이 받은 ZIP이 태그 소스와 일치하는지, 저장소가 공개인지 확인합니다. 기존 릴리스는 검증만 하고 덮어쓰지 않습니다. 태그나 릴리스가 충돌하면 중단합니다.

마켓플레이스 설치는 릴리스 태그가 아닌 저장소를 선택하므로 릴리스가 설치 버전을 고정하지는 않습니다. 플러그인 버전과 PixelbankStudio API 계약 버전도 별개입니다.
