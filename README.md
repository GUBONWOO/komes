# KOMES

매일 직접 일본 부동산 사이트를 확인하는 게 번거로워서
수도권 매물을 자동으로 수집하고 검색할 수 있도록 직접 만든 사내 도구입니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Runtime | Node.js 20 |
| Language | TypeScript |
| Frontend | React 18, Vite |
| Backend | Express |
| Crawler | Puppeteer Real Browser |
| Database | PostgreSQL 16 |
| Auth | Google OAuth 2.0, JWT (httpOnly Cookie) |
| Infra | Docker, Docker Compose, Nginx, Let's Encrypt (HTTPS) |

---

## 주요 기능

- 도쿄 · 사이타마 · 치바 · 카나가와 매물 매일 자동 크롤링
- 에리어 · 노선 · 역 · 가격 · 徒歩 · 토지/건물 면적 · 축년수 복합 필터
- 중고 매물 가격 변경 이력 자동 기록 및 조회
- 관심 목록 — 매물이 상장 폐지된 후에도 스냅샷으로 유지
- Google OAuth 로그인 / 내부 IP 자동 관리자 인증

---

## 프론트엔드 구성

```
client/src/
├── App.tsx          # 전체 상태 관리, 사이드바(노선 · 역), 레이아웃
├── FilterBar.tsx    # 에리어 · 가격 · 축년수 등 칩 형태 필터
├── PropertyCard.tsx # 매물 카드 (교통 파싱, 가격 이력 모달, 관심 버튼)
├── Pagination.tsx   # 페이지네이션
├── LoginPage.tsx    # Google OAuth 로그인 화면
├── api.ts           # Axios 기반 API 클라이언트
├── constants.ts     # 필터 옵션 상수 정의
└── types.ts         # 공통 타입 정의
```

필터 변경 시 `AbortController`로 이전 요청을 즉시 취소해 응답 순서가 역전되는 문제를 방지합니다.
페이지 이동 시에는 `skipCount` 옵션으로 COUNT 쿼리를 생략해 응답 속도를 개선했습니다.

---

## 백엔드 구성

```
server/
├── index.ts              # Express 앱, 인증 미들웨어, 배치 크롤링 루프
├── crawler.ts            # Puppeteer 크롤러 (페이지 파싱, 상세 스크랩, DB 저장)
├── db.ts                 # DB 초기화, 테이블 · 뷰 생성, 마이그레이션
├── lines.ts              # 30개 지역 정의 (slug, prefecture)
├── types.ts              # 서버 공통 타입
└── routes/
    ├── properties.ts     # 매물 조회 API (다중 필터, 정렬, 페이지네이션)
    ├── auth.ts           # Google OAuth 콜백, JWT 발급
    ├── watchlist.ts      # 관심 목록 CRUD
    └── favorites.ts      # 즐겨찾기
```

**Cloudflare 우회**
일반 Puppeteer는 Cloudflare Turnstile에 차단됩니다.
실제 브라우저 핑거프린트를 사용하는 `puppeteer-real-browser`로 우회하고,
차단 감지 시 30초 후 자동 재시도합니다.

**지역별 분리 테이블 + UNION VIEW**
30개 지역을 단일 테이블로 관리하면 동시 크롤링 시 쓰기 경합이 발생합니다.
지역마다 별도 테이블(`prop_chiyoda_city` 등)을 두고 `properties` VIEW로 통합하는 방식으로 해결했습니다.

**크롤링 안전장치**
수집량이 기존의 30% 미만이면 대량 삭제를 자동으로 보류합니다.
신규 매물만 상세 페이지를 방문해 불필요한 요청을 최소화합니다.

---

## 서버 · 인프라 구성

```
Docker Compose
├── postgres   PostgreSQL 16 (데이터 영속 볼륨)
├── server     Node.js 20 + Express (크롤러 포함)
└── client     Nginx (React 빌드 서빙, HTTPS 종단, API 프록시)
```

- Let's Encrypt 인증서로 HTTPS 적용
- 내부 네트워크 IP는 JWT 없이 관리자 자동 인증
- 크롤러는 서버 프로세스 내 무한 루프로 8개 그룹을 순환 실행 — 별도 스케줄러 불필요
- 현재 수도권 11,000건 이상 매물 운영 중
