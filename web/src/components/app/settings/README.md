# 설정 컴포넌트 구조

- `settings-workspace.tsx`: 데이터 로딩과 전역 atom 연결.
- `settings-panel.tsx`: 화면 레이아웃. 탐색, 닫기 버튼, 섹션 렌더링은 각각 `settings-navigation`, `settings-controls`, `settings-content`가 담당.
- `types.ts`, `navigation.ts`: 지원하는 설정 경로와 메뉴 정의. 기존 `/settings/$section` URL은 유지.
- `theme/`, `persona/`: 기능별 화면, 하위 컴포넌트, 상태 처리 훅.
- `model-presets/`: 모델/API 키 목록, 편집기, 인증 입력, 가져온 프로필 필드와 데이터 변환.
- `model-chains/`: React Flow 자유 연결 노드 편집기, 저장 그래프와 실행 계획 투영, 에이전트 상세 편집기, 체인 편집 훅과 순수 데이터 조작 함수. 설계와 제약은 [model-chains/README.md](model-chains/README.md) 참고.
- `prompt/`: 프롬프트 프리셋 작업대 및 탭별 편집기.
- `modules/`: 설정 하위의 모듈 작업대, 모듈 모델, 기본 정보/Lua/에셋/프롬프트/정규식/로어북/고급 설정 편집기.
- `shared/`: 설정과 모듈이 함께 쓰는 UI, 정규식 행, 토글 텍스트 편집기와 문법 변환, 기본값, 컬렉션 유틸리티 및 자동 저장/CRUD 훅.

기능 전용 로직은 해당 기능 폴더에 둡니다. `shared`는 프리셋이나 모듈 편집기를 import하지 않으며, 공용 작업대와 저장 훅은 props/callback으로 기능별 동작을 전달받습니다. 화면 밖의 채팅/로어북 등도 공용 설정 UI가 필요하면 `settings/shared`를 직접 참조합니다.

모듈과 프롬프트의 `advanced-section`은 ‘고급 설정’ 탭에서 커스텀 토글 textarea를 바로 표시합니다. 별도 커스텀 토글 탭이나 개별 행 편집기는 두지 않습니다. `prompt-toggle-advanced-editor`가 초안·적용을, `prompt-toggle-textarea`가 입력·도구 모음을, `prompt-toggle-syntax`가 변환·검증을 담당합니다. Risu 형식의 텍스트는 전체 검증을 통과한 뒤 적용되며, 기존 키·타입의 기본값을 유지합니다. 모듈은 200개, 프리셋은 1,000개 제한을 각각 전달합니다.
