# 성경 암송 디스코드 봇 — 셋업 가이드

> 이 가이드를 처음부터 끝까지 따라가면 디스코드 경험이 전혀 없어도 완전한 시스템을 구축할 수 있습니다.
> 예상 소요 시간: 약 2~3시간 (처음 하는 경우 기준)

---

## 목차

1. [개요](#1-개요)
2. [Discord 서버 셋업](#2-discord-서버-셋업)
3. [Discord 봇 생성](#3-discord-봇-생성)
4. [프로젝트 구조](#4-프로젝트-구조)
5. [데이터베이스 설계](#5-데이터베이스-설계)
6. [핵심 코드 로직](#6-핵심-코드-로직)
7. [환경 변수 & 설정](#7-환경-변수--설정)
8. [로컬 개발 & 테스트](#8-로컬-개발--테스트)
9. [Railway 배포](#9-railway-배포)
10. [운영 가이드](#10-운영-가이드)
11. [확장 가이드](#11-확장-가이드)
12. [트러블슈팅](#12-트러블슈팅)

---

## 1. 개요

### 1.1 시스템 소개

이 봇은 소규모 성경 암송 팀(7~8명)이 **매일 꾸준히 성경 구절을 암송**할 수 있도록 돕는 디스코드 봇입니다.

**왜 디스코드인가?**
- 팀원 대부분이 이미 사용 중인 플랫폼
- 봇 개발 생태계가 풍부하고 무료 호스팅 가능
- DM, 채널, 역할 관리가 모두 내장되어 있어 별도 앱 개발 불필요
- 모바일/데스크탑 모두 지원, 버튼 인터랙션으로 UX 간소화

**핵심 워크플로우:**
1. 매일 아침 봇이 각 멤버에게 DM을 보냄
2. DM에는 동기부여 말씀 + 오늘 암송할 구절 목록 + 버튼이 포함됨
3. 멤버가 버튼 한 번(또는 두 번)으로 완료 보고
4. 완료 시 자동으로 `#암송-인증` 채널에 게시됨 (미완료는 게시 안 함)
5. 매주 자동으로 이미지 형태의 진도 리포트가 `#진도표` 채널에 게시됨

### 1.2 전체 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        Railway 서버 (무료)                       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  node-cron   │───▶│  scheduler   │───▶│  discord.js API  │   │
│  │  (스케줄러)   │    │  (알림 발송)  │    │  (메시지 전송)    │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│                              │                      │            │
│  ┌──────────────┐            │                      ▼            │
│  │ better-sqlite│◀───────────┘           ┌──────────────────┐   │
│  │   (DB)       │                        │  버튼 인터랙션    │   │
│  └──────────────┘                        │  핸들러           │   │
│         │                                └──────────────────┘   │
│         │                                         │              │
│  ┌──────────────┐                                 ▼              │
│  │  node-canvas │◀────────── 주간 리포트 ─── 진도 집계           │
│  │  (이미지 생성)│                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
          │                                │
          ▼                                ▼
   ┌─────────────┐                 ┌──────────────┐
   │  Discord DM  │                │ Discord 채널  │
   │ (각 멤버에게) │                │ #암송-인증    │
   └─────────────┘                │ #진도표       │
                                  └──────────────┘
```

### 1.3 기능 요약

| 기능 | 설명 | 자동 여부 |
|------|------|----------|
| 매일 DM 알림 | 아침마다 오늘의 암송 구절 + 버튼 전송 | 자동 (cron) |
| 간격 반복 복습 | 알고리즘이 오늘 복습할 구절 자동 선택 | 자동 |
| 신규 구절 배정 | 매주 2구절씩 자동 배정 | 자동 (cron) |
| 완료 인증 | 버튼 클릭 시 #암송-인증 채널에 자동 게시 | 자동 |
| 부분 완료 | 구절 수 선택 버튼으로 일부만 기록 가능 | 수동 (버튼) |
| 주간 리포트 | 매주 이미지로 팀 진도 현황 게시 | 자동 (cron) |
| 멤버 등록 | /등록 슬래시 커맨드로 가입 | 수동 |
| 개인 진도 조회 | /진도 커맨드로 본인 현황 확인 | 수동 |
| 관리자 명령어 | /관리 커맨드로 멤버 관리, 수동 리포트 등 | 수동 |

**지원 커리큘럼:**

| 코스 | 이름 | 구절 수 | 단계 |
|------|------|---------|------|
| 1 | 입문 | 5구절 | 기초 |
| 2 | 초급 | 8구절 | 기초 |
| 3 | 중급 | 60구절 | 성장 |
| 4 | 고급 | 242구절 | 심화 |
| 5 | 완성 | 180구절 | 마스터 |

---

## 2. Discord 서버 셋업

### 2.1 서버 생성

**단계 1: 새 서버 만들기**

1. 디스코드를 열고 왼쪽 사이드바 맨 아래쪽의 **`+`** 버튼(초록색 동그라미)을 클릭합니다.
2. 팝업이 뜨면 **"직접 만들기"** 를 클릭합니다.
3. 다음 화면에서 **"나와 친구들을 위해"** 를 선택합니다.
4. 서버 이름 입력란에 `성경암송팀` 을 입력합니다.
5. (선택) 서버 아이콘 이미지를 업로드합니다.
6. **"만들기"** 버튼을 클릭합니다.

> 서버가 생성되면 기본적으로 `#일반` 채널 하나가 만들어집니다. 이후 단계에서 구조를 재편할 예정입니다.

---

### 2.2 채널 구조 만들기

최종 목표 구조는 다음과 같습니다:

```
📖 성경암송팀
├── 📁 안내
│   ├── #공지사항
│   └── #사용법
├── 📁 암송
│   ├── #오늘의-암송
│   ├── #암송-인증
│   └── #진도표
├── 📁 나눔 (확장용)
│   ├── #성경읽기
│   ├── #기도제목
│   └── #자유게시판
└── 📁 관리
    └── #봇-설정
```

**카테고리와 채널 만들기 방법:**

카테고리(폴더)를 먼저 만들고, 그 안에 채널을 만드는 순서로 진행합니다.

**[안내] 카테고리 만들기:**

1. 서버 이름(좌측 상단) 옆의 화살표(▼)를 클릭하거나, 채널 목록 빈 곳에서 **마우스 우클릭** → **"카테고리 만들기"** 를 선택합니다.
2. 카테고리 이름에 `안내` 를 입력하고 **"카테고리 만들기"** 를 클릭합니다.
3. 생성된 `안내` 카테고리 옆의 **`+`** 버튼을 클릭합니다.
4. **"텍스트 채널"** 을 선택하고 채널 이름에 `공지사항` 을 입력 → **"채널 만들기"** 클릭.
5. 같은 방법으로 `사용법` 채널도 만듭니다.

**[암송] 카테고리와 채널 만들기:**

1. 위와 같은 방법으로 `암송` 카테고리를 만듭니다.
2. 그 안에 `오늘의-암송`, `암송-인증`, `진도표` 채널을 순서대로 만듭니다.

**[나눔] 카테고리와 채널 만들기:**

1. `나눔` 카테고리를 만듭니다.
2. 그 안에 `성경읽기`, `기도제목`, `자유게시판` 채널을 만듭니다.

**[관리] 카테고리와 채널 만들기:**

1. `관리` 카테고리를 만듭니다.
2. 그 안에 `봇-설정` 채널을 만듭니다.

---

**채널별 용도 설명:**

| 채널 | 용도 | 접근 권한 |
|------|------|----------|
| #공지사항 | 중요 공지, 일정 변경 등 | 모든 멤버 읽기, 관리자만 쓰기 |
| #사용법 | 봇 사용 방법 안내 | 모든 멤버 읽기 |
| #오늘의-암송 | 오늘의 암송 구절 공유 (봇 또는 수동) | 모든 멤버 |
| #암송-인증 | 완료 시 봇이 자동 게시 | 모든 멤버 읽기, 봇만 쓰기 |
| #진도표 | 주간 이미지 리포트 | 모든 멤버 읽기, 봇만 쓰기 |
| #성경읽기 | 성경 읽기 나눔 (선택 운영) | 모든 멤버 |
| #기도제목 | 기도제목 나눔 (선택 운영) | 모든 멤버 |
| #자유게시판 | 자유 대화 | 모든 멤버 |
| #봇-설정 | 관리자 봇 명령어 | 관리자만 |

---

### 2.3 역할 설정

역할(Role)은 멤버에게 권한과 호칭을 부여하는 시스템입니다.

**역할 만들기:**

1. 서버 이름 옆 **▼** → **"서버 설정"** 을 클릭합니다.
2. 왼쪽 메뉴에서 **"역할"** 을 선택합니다.
3. 오른쪽 상단 **"역할 만들기"** 버튼을 클릭합니다.

**@관리자 역할 설정:**

1. 역할 이름: `관리자`
2. 색상: 원하는 색 선택 (예: 노란색)
3. **"권한"** 탭에서 다음을 켜줍니다:
   - 메시지 관리
   - 채널 관리
   - 멤버 관리
   - 역할 관리
   - 관리자 (이것 하나로 모든 권한이 포함됩니다)
4. **"저장"** 클릭.

**@멤버 역할 설정:**

1. 역할 이름: `멤버`
2. 색상: 원하는 색 선택 (예: 파란색)
3. 권한: 기본값 유지 (메시지 읽기, 보내기만 가능)
4. **"저장"** 클릭.

**역할 부여하기:**

1. 서버에서 멤버의 이름을 클릭합니다.
2. 팝업에서 **"역할"** 옆의 **`+`** 버튼을 클릭합니다.
3. 원하는 역할을 선택합니다.

> 본인(서버 소유자)에게 @관리자 역할을 부여하고, 나머지 팀원들에게 @멤버 역할을 부여합니다.

---

## 3. Discord 봇 생성

### 3.1 Developer Portal에서 봇 만들기

**단계 1: Developer Portal 접속**

1. 브라우저에서 `https://discord.com/developers/applications` 에 접속합니다.
2. 본인의 디스코드 계정으로 로그인합니다.

**단계 2: 새 애플리케이션 만들기**

1. 우측 상단의 파란색 **"New Application"** 버튼을 클릭합니다.
2. 이름 입력란에 `성경암송봇` 을 입력합니다.
3. 서비스 이용 약관 체크박스에 체크하고 **"Create"** 를 클릭합니다.

**단계 3: 봇 설정**

1. 좌측 메뉴에서 **"Bot"** 을 클릭합니다.
2. **"Add Bot"** 버튼 → **"Yes, do it!"** 확인.
3. 봇 이름 아래에 **"Reset Token"** 버튼을 클릭합니다.
4. 확인 팝업에서 **"Yes, do it!"** 클릭.
5. 토큰(긴 문자열)이 표시됩니다. **반드시 복사해서 안전한 곳에 보관**하세요.

> **보안 주의**: 토큰은 봇의 비밀번호입니다. 절대 다른 사람에게 알려주거나 GitHub에 올리면 안 됩니다!

**단계 4: 봇 프로필 설정 (선택)**

1. **"Bot"** 메뉴에서 봇 아이콘을 클릭하여 프로필 이미지를 업로드합니다.
2. **Username** 을 원하는 이름으로 변경합니다 (예: `암송봇`).

---

### 3.2 봇 권한 설정

**Privileged Gateway Intents 설정:**

Bot 메뉴에서 아래로 스크롤하면 **"Privileged Gateway Intents"** 섹션이 있습니다.

다음 두 가지를 **반드시 켜줍니다:**

- **SERVER MEMBERS INTENT** → 토글 켜기 (파란색)
- **MESSAGE CONTENT INTENT** → 토글 켜기 (파란색)

켜고 나서 **"Save Changes"** 버튼을 클릭합니다.

**필요한 Intents 목록 (코드에서 사용):**

| Intent | 용도 |
|--------|------|
| GUILDS | 서버 정보 접근 |
| GUILD_MEMBERS | 멤버 목록 조회 |
| GUILD_MESSAGES | 채널 메시지 읽기 |
| GUILD_MESSAGE_REACTIONS | 이모지 반응 감지 |
| DIRECT_MESSAGES | 개인 DM 발송 |
| MESSAGE_CONTENT | 메시지 내용 읽기 |

---

### 3.3 봇 서버 초대 링크 만들기

**OAuth2 URL 생성:**

1. 좌측 메뉴에서 **"OAuth2"** → **"URL Generator"** 를 클릭합니다.
2. **SCOPES** 섹션에서 다음을 체크합니다:
   - `bot`
   - `applications.commands`
3. **BOT PERMISSIONS** 섹션이 나타나면 다음을 체크합니다:
   - `Send Messages` (메시지 보내기)
   - `Send Messages in Threads` (스레드에 메시지 보내기)
   - `Embed Links` (링크 임베드)
   - `Attach Files` (파일 첨부 — 이미지 리포트용)
   - `Read Message History` (메시지 기록 읽기)
   - `Add Reactions` (반응 추가)
   - `Use Slash Commands` (슬래시 커맨드 사용)
   - `Manage Messages` (메시지 관리)

4. 페이지 하단의 **"GENERATED URL"** 을 복사합니다.

**봇 서버 초대:**

1. 복사한 URL을 브라우저 주소창에 붙여넣고 접속합니다.
2. **"서버 선택"** 드롭다운에서 `성경암송팀` 서버를 선택합니다.
3. **"계속"** → **"승인"** 클릭.
4. 봇이 서버에 입장하면 `#일반` 채널에 봇이 나타납니다.

---

**서버 ID와 채널 ID 복사하기 (나중에 필요):**

먼저 개발자 모드를 켜야 합니다:
1. 디스코드 **사용자 설정**(왼쪽 하단 톱니바퀴 아이콘) → **"고급"** → **"개발자 모드"** 토글 켜기.

이후:
- **서버 ID**: 서버 이름 우클릭 → **"ID 복사"**
- **채널 ID**: 채널 이름 우클릭 → **"ID 복사"**

복사한 ID들을 메모장에 기록해두세요. `.env` 파일 작성 시 사용합니다.

---

## 4. 프로젝트 구조

최종 프로젝트 구조입니다. 각 파일의 역할을 이해하고 진행하면 훨씬 수월합니다.

```
bible-memorization-bot/
├── src/
│   ├── index.js                  — 봇 진입점, 클라이언트 초기화
│   ├── config.js                 — 환경변수 로딩 및 검증
│   ├── database/
│   │   ├── schema.sql            — 테이블 정의 SQL
│   │   ├── init.js               — DB 초기화 (앱 시작 시 실행)
│   │   └── queries.js            — 모든 DB 쿼리 함수 모음
│   ├── commands/
│   │   ├── register.js           — /등록 슬래시 커맨드
│   │   ├── settings.js           — /설정 슬래시 커맨드
│   │   ├── progress.js           — /진도 슬래시 커맨드
│   │   └── admin.js              — /관리 관리자 커맨드
│   ├── interactions/
│   │   └── buttons.js            — 버튼 클릭 이벤트 핸들러
│   ├── scheduler/
│   │   ├── daily.js              — 매일 알림 스케줄러 (node-cron)
│   │   ├── weekly.js             — 주간 리포트 스케줄러
│   │   └── newverse.js           — 신규 구절 자동 배정
│   ├── services/
│   │   ├── spaced-repetition.js  — 간격 반복 알고리즘
│   │   ├── progress.js           — 진도 관리 서비스
│   │   └── report.js             — node-canvas 이미지 리포트 생성
│   └── utils/
│       ├── messages.js           — 메시지 템플릿 함수
│       └── bible-verses.js       — 동기부여 말씀 배열
├── data/
│   └── curriculum/
│       ├── course1-intro.json    — 입문 코스 (5구절)
│       ├── course2-basic.json    — 초급 코스 (8구절)
│       ├── course3-mid.json      — 중급 코스 (60구절)
│       ├── course4-advanced.json — 고급 코스 (242구절)
│       └── course5-master.json   — 완성 코스 (180구절)
├── .env                          — 환경변수 (절대 Git에 올리지 않음!)
├── .env.example                  — 환경변수 예시 (Git에 올려도 됨)
├── .gitignore                    — Git 제외 파일 목록
├── package.json
├── railway.json                  — Railway 배포 설정
└── README.md
```

---

## 5. 데이터베이스 설계

### 5.1 ERD (Entity Relationship Diagram)

```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────┐
│   members    │       │   member_progress    │       │   verses     │
│─────────────-│       │─────────────────────│       │──────────────│
│ id (PK)      │──┐    │ id (PK)             │    ┌──│ id (PK)      │
│ discord_id   │  └───▶│ member_id (FK)      │    │  │ course_id    │
│ discord_name │       │ verse_id (FK)       │◀───┘  │ order_num    │
│ course_id    │       │ status              │       │ reference    │
│ daily_goal   │       │ review_count        │       │ text         │
│ streak       │       │ last_reviewed_at    │       │ text_short   │
│ timezone     │       │ next_review_at      │       └──────────────┘
│ is_active    │       │ first_learned_at    │              │
│ created_at   │       └─────────────────────┘              │
└──────────────┘                                     ┌──────────────┐
       │                                             │   courses    │
       │                ┌──────────────┐             │──────────────│
       │                │  daily_logs  │             │ id (PK)      │
       └──────────────▶ │──────────────│             │ name         │
                        │ id (PK)      │             │ description  │
                        │ member_id    │             │ total_verses │
                        │ log_date     │             └──────────────┘
                        │ verses_done  │
                        │ verses_total │
                        │ status       │
                        │ created_at   │
                        └──────────────┘
```

### 5.2 테이블 상세

`src/database/schema.sql` 파일의 전체 내용:

```sql
-- ================================================
-- 성경 암송 봇 데이터베이스 스키마
-- ================================================

-- 코스 테이블: 암송 커리큘럼 단계 정보
CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,          -- 코스 이름 (예: 입문, 초급)
  description TEXT,                   -- 코스 설명
  total_verses INTEGER NOT NULL,      -- 총 구절 수
  created_at  DATETIME DEFAULT (datetime('now'))
);

-- 구절 테이블: 모든 암송 구절 데이터
CREATE TABLE IF NOT EXISTS verses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER NOT NULL,       -- 소속 코스
  order_num   INTEGER NOT NULL,       -- 코스 내 순서
  reference   TEXT NOT NULL,          -- 구절 참조 (예: 요 3:16)
  text        TEXT NOT NULL,          -- 구절 전문
  text_short  TEXT,                   -- 줄여 표시할 때 사용하는 짧은 버전
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- 멤버 테이블: 봇을 사용하는 팀원 정보
CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT NOT NULL UNIQUE,  -- 디스코드 유저 ID (변하지 않음)
  discord_name  TEXT NOT NULL,         -- 디스코드 닉네임 (표시용)
  course_id     INTEGER DEFAULT 1,     -- 현재 수강 중인 코스
  daily_goal    INTEGER DEFAULT 5,     -- 하루 목표 복습 구절 수
  streak        INTEGER DEFAULT 0,     -- 연속 완료 일수
  timezone      TEXT DEFAULT 'Asia/Seoul', -- 타임존
  is_active     INTEGER DEFAULT 1,     -- 활성 여부 (0=비활성)
  created_at    DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- 멤버 진도 테이블: 각 멤버의 각 구절에 대한 암송 상태
-- 이 테이블이 간격 반복 알고리즘의 핵심입니다
CREATE TABLE IF NOT EXISTS member_progress (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id         INTEGER NOT NULL,
  verse_id          INTEGER NOT NULL,
  status            TEXT DEFAULT 'new',
    -- 'new'       : 아직 배우지 않은 구절
    -- 'learning'  : 배우는 중 (7일 미만)
    -- 'memorized' : 암기 완료 (7일 이상 연속 성공)
    -- 'reviewing' : 장기 복습 중
  review_count      INTEGER DEFAULT 0,   -- 총 복습 횟수
  correct_count     INTEGER DEFAULT 0,   -- 성공적으로 복습한 횟수
  last_reviewed_at  DATETIME,            -- 마지막 복습 일시
  next_review_at    DATETIME,            -- 다음 복습 예정 일시
  first_learned_at  DATETIME,            -- 처음 배운 날짜
  interval_days     INTEGER DEFAULT 1,   -- 현재 복습 간격 (일)
  UNIQUE(member_id, verse_id),
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (verse_id) REFERENCES verses(id)
);

-- 일일 로그 테이블: 매일의 암송 기록
CREATE TABLE IF NOT EXISTS daily_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     INTEGER NOT NULL,
  log_date      TEXT NOT NULL,          -- 날짜 (YYYY-MM-DD 형식)
  verses_done   INTEGER DEFAULT 0,      -- 완료한 구절 수
  verses_total  INTEGER DEFAULT 0,      -- 오늘 목표 구절 수
  status        TEXT DEFAULT 'pending',
    -- 'pending'  : 오늘 아직 보고하지 않음
    -- 'complete' : 전부 완료
    -- 'partial'  : 일부 완료
    -- 'skipped'  : 오늘 쉬기로 함
  note          TEXT,                   -- 메모 (선택)
  created_at    DATETIME DEFAULT (datetime('now')),
  UNIQUE(member_id, log_date),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- 설정 테이블: 봇 전체 설정값
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 기본 설정값 삽입
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('weekly_new_verse_count', '2'),     -- 주당 신규 구절 수
  ('new_verse_day', 'wednesday'),      -- 신규 구절 배정 요일
  ('reminder_time', '07:00'),          -- 알림 시간
  ('report_day', 'sunday'),            -- 주간 리포트 요일
  ('report_time', '20:00');            -- 리포트 발송 시간
```

---

### 5.3 Spaced Repetition 상태 머신

간격 반복(Spaced Repetition)은 **기억 곡선**을 활용한 암기 효율화 방법입니다.
구절을 기억하고 있으면 복습 간격이 늘어나고, 기억 못 하면 줄어드는 방식입니다.

```
                   처음 배움
                      │
                      ▼
              ┌──── new ────┐
              │  (배정됨)   │
              └─────────────┘
                      │ 첫 번째 복습 시
                      ▼
              ┌─── learning ───┐
              │  (배우는 중)   │
              │  매일 복습     │
              └────────────────┘
                      │ 7일 이상 연속 성공 시
                      ▼
              ┌─── memorized ──┐
              │   (암기 완료)  │  ◀──── 실패 시 다시 내려오지 않고
              │   간격 증가    │         간격만 리셋됩니다
              └────────────────┘
                      │ 30일 이상 간격 도달 시
                      ▼
              ┌─── reviewing ──┐
              │   (장기 복습)  │
              │   월 1회 복습  │
              └────────────────┘
```

**복습 간격 배열:**

```
review_count: [0,  1,  2,  3,  4,  5,  6,  7,  8,   9,  10,  11,  12,  13+]
interval(일): [1,  1,  1,  1,  1,  1,  1,  2,  2,   3,   3,   7,  14,  30]
```

즉, 7번 연속 성공 전까지는 매일 복습, 이후 2일 → 3일 → 1주 → 2주 → 1달 순으로 간격이 늘어납니다.

**알고리즘 의사 코드:**

```
function selectReviewVerses(memberId, count):

  1. 해당 멤버의 모든 진도 레코드 조회
     - status가 'new'가 아닌 것들 (배운 적 있는 구절)
     - member_progress JOIN verses

  2. 각 구절의 다음 복습 날짜 계산:
     next_review_at = last_reviewed_at + intervals[review_count] 일

  3. 구절들을 우선순위 순으로 정렬:
     a. 오늘까지 복습 기한이 된 것 (next_review_at <= 오늘)  ← 최우선
     b. 기한이 지난 정도가 클수록 위로 (가장 오래된 것 먼저)
     c. 기한이 안 된 것은 가장 나중에

  4. 상위 count개 반환

  5. 만약 count에서 모자라면:
     - status가 'new'인 구절에서 order_num 순서대로 채움
     - 이렇게 처음 배우게 되는 구절의 status를 'learning'으로 변경
```

---

## 6. 핵심 코드 로직

### 6.1 봇 초기화 & 이벤트 핸들링

`src/index.js`:

```javascript
// ================================================
// 성경 암송 봇 — 메인 진입점
// ================================================

require('dotenv').config(); // .env 파일의 환경변수를 로드합니다

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { initDatabase } = require('./database/init');
const { registerCommands } = require('./commands/register');
const { handleButton } = require('./interactions/buttons');
const { startDailyScheduler } = require('./scheduler/daily');
const { startWeeklyScheduler } = require('./scheduler/weekly');
const { startNewVerseScheduler } = require('./scheduler/newverse');

// 디스코드 클라이언트 생성 — 필요한 Intents만 선언합니다
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,                // 서버 정보 접근
    GatewayIntentBits.GuildMembers,           // 멤버 목록 조회
    GatewayIntentBits.GuildMessages,          // 채널 메시지
    GatewayIntentBits.GuildMessageReactions,  // 이모지 반응
    GatewayIntentBits.DirectMessages,         // DM 발송/수신
    GatewayIntentBits.MessageContent,         // 메시지 내용 읽기
  ],
});

// 슬래시 커맨드 컬렉션
client.commands = new Collection();

// ── 봇 준비 이벤트 ──────────────────────────────
client.once('ready', async () => {
  console.log(`✅ 봇 로그인 완료: ${client.user.tag}`);

  // 1. 데이터베이스 초기화 (테이블이 없으면 생성)
  await initDatabase();
  console.log('✅ 데이터베이스 초기화 완료');

  // 2. 슬래시 커맨드 Discord API에 등록
  await registerCommands(client);
  console.log('✅ 슬래시 커맨드 등록 완료');

  // 3. 스케줄러 시작
  startDailyScheduler(client);
  startWeeklyScheduler(client);
  startNewVerseScheduler(client);
  console.log('✅ 스케줄러 시작 완료');

  console.log('🙏 성경 암송 봇이 준비되었습니다!');
});

// ── 슬래시 커맨드 처리 ───────────────────────────
client.on('interactionCreate', async (interaction) => {
  // 버튼 클릭 처리
  if (interaction.isButton()) {
    await handleButton(interaction, client);
    return;
  }

  // 슬래시 커맨드 처리
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`커맨드 실행 오류 (${interaction.commandName}):`, error);
      // 오류 시 사용자에게 에러 메시지 표시
      const errorMsg = { content: '명령 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMsg);
      } else {
        await interaction.reply(errorMsg);
      }
    }
    return;
  }

  // 선택 메뉴(SelectMenu) 처리
  if (interaction.isStringSelectMenu()) {
    const command = client.commands.get(interaction.customId.split(':')[0]);
    if (command && command.handleSelect) {
      await command.handleSelect(interaction, client);
    }
    return;
  }
});

// ── 봇 로그인 ────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
```

---

### 6.2 슬래시 커맨드 등록

`src/commands/register.js`:

```javascript
// ================================================
// 슬래시 커맨드 정의 및 Discord API 등록
// ================================================

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// 사용 가능한 모든 슬래시 커맨드 정의
const commands = [
  // /등록 — 새 멤버 가입
  new SlashCommandBuilder()
    .setName('등록')
    .setDescription('성경 암송 팀에 등록합니다')
    .toJSON(),

  // /설정 — 개인 설정 변경
  new SlashCommandBuilder()
    .setName('설정')
    .setDescription('나의 암송 설정을 변경합니다')
    .addIntegerOption(option =>
      option.setName('하루목표')
        .setDescription('하루에 복습할 구절 수 (기본값: 5)')
        .setMinValue(1)
        .setMaxValue(20)
    )
    .toJSON(),

  // /진도 — 개인 진도 조회
  new SlashCommandBuilder()
    .setName('진도')
    .setDescription('나의 암송 진도를 확인합니다')
    .toJSON(),

  // /관리 — 관리자 전용 명령어
  new SlashCommandBuilder()
    .setName('관리')
    .setDescription('관리자 전용 명령어')
    .addSubcommand(sub =>
      sub.setName('멤버목록').setDescription('등록된 멤버 목록을 봅니다')
    )
    .addSubcommand(sub =>
      sub.setName('리포트').setDescription('지금 즉시 주간 리포트를 발송합니다')
    )
    .addSubcommand(sub =>
      sub.setName('알림테스트').setDescription('지금 즉시 오늘 알림을 발송합니다')
    )
    .toJSON(),
];

// Discord API에 슬래시 커맨드 등록하는 함수
async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    // 서버(Guild) 단위로 등록하면 즉시 반영됩니다
    // 전역(Global) 등록은 최대 1시간 소요
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    // 커맨드 핸들러도 컬렉션에 등록
    const { execute: registerExecute } = require('./register-handler');
    const { execute: settingsExecute } = require('./settings');
    const { execute: progressExecute } = require('./progress');
    const { execute: adminExecute } = require('./admin');

    client.commands.set('등록', { execute: registerExecute });
    client.commands.set('설정', { execute: settingsExecute });
    client.commands.set('진도', { execute: progressExecute });
    client.commands.set('관리', { execute: adminExecute });

  } catch (error) {
    console.error('커맨드 등록 실패:', error);
    throw error;
  }
}

module.exports = { registerCommands };
```

---

### 6.3 매일 알림 로직

`src/scheduler/daily.js`:

```javascript
// ================================================
// 매일 아침 DM 알림 스케줄러
// ================================================

const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../database/init');
const { selectReviewVerses } = require('../services/spaced-repetition');
const { getMotivationalVerse } = require('../utils/bible-verses');
const { getTodayNewVerse } = require('./newverse');

function startDailyScheduler(client) {
  // node-cron 표현식: '분 시 * * *'
  // 예) '0 7 * * *' = 매일 오전 7시 정각
  const [hour, minute] = process.env.DAILY_REMINDER_TIME.split(':');
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(cronExpr, async () => {
    console.log(`[알림] 오늘의 암송 알림 발송 시작 — ${new Date().toLocaleString('ko-KR')}`);
    await sendDailyReminders(client);
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Seoul'
  });

  console.log(`[알림] 스케줄 등록 완료: 매일 ${process.env.DAILY_REMINDER_TIME} (KST)`);
}

// 모든 활성 멤버에게 DM을 발송하는 메인 함수
async function sendDailyReminders(client) {
  // 1. 활성 멤버 전체 조회
  const members = db.prepare(`
    SELECT * FROM members WHERE is_active = 1
  `).all();

  for (const member of members) {
    try {
      await sendReminderToMember(client, member);
      // API 레이트 리밋 방지를 위해 멤버 간 0.5초 대기
      await sleep(500);
    } catch (error) {
      console.error(`[알림] 멤버 ${member.discord_name} 알림 실패:`, error.message);
    }
  }

  console.log(`[알림] 전체 발송 완료 (${members.length}명)`);
}

// 특정 멤버에게 DM 발송
async function sendReminderToMember(client, member) {
  // 2. 오늘 복습할 구절 선택 (간격 반복 알고리즘)
  const reviewVerses = await selectReviewVerses(member.id, member.daily_goal);

  // 3. 오늘이 신규 구절 배정일인지 확인
  const newVerse = await getTodayNewVerse(member.id);

  // 4. 오늘 일일 로그 생성 (중복 방지: OR IGNORE)
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const totalVerses = reviewVerses.length + (newVerse ? 1 : 0);

  db.prepare(`
    INSERT OR IGNORE INTO daily_logs (member_id, log_date, verses_total, status)
    VALUES (?, ?, ?, 'pending')
  `).run(member.id, today, totalVerses);

  // 5. 디스코드 유저 객체 가져오기
  const discordUser = await client.users.fetch(member.discord_id);

  // 6. DM 임베드 메시지 구성
  const motivationalVerse = getMotivationalVerse();
  const verseListText = buildVerseListText(reviewVerses, newVerse);

  const embed = new EmbedBuilder()
    .setColor(0x4A90D9) // 하늘색
    .setTitle('📖 오늘의 암송 알림')
    .setDescription(`> *"${motivationalVerse.text}"*\n> — ${motivationalVerse.reference}`)
    .addFields(
      {
        name: '✨ 오늘의 계획',
        value: verseListText || '오늘은 배정된 구절이 없습니다!',
        inline: false
      },
      {
        name: '📊 현황',
        value: `연속 완료: **${member.streak}일** | 오늘 목표: **${totalVerses}구절**`,
        inline: false
      }
    )
    .setFooter({ text: '버튼을 눌러 완료를 기록해주세요 🙏' })
    .setTimestamp();

  // 7. 버튼 구성
  // 첫 번째 행: 주요 액션 버튼들
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_verses:${member.id}:${today}`)
      .setLabel('📖 구절 보기')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`complete_all:${member.id}:${today}`)
      .setLabel('✅ 다 했어요!')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`complete_partial:${member.id}:${today}`)
      .setLabel('🔢 일부만 했어요')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`skip_today:${member.id}:${today}`)
      .setLabel('😴 오늘은 쉴게요')
      .setStyle(ButtonStyle.Danger),
  );

  // 8. DM 발송
  await discordUser.send({ embeds: [embed], components: [row1] });
  console.log(`[알림] ${member.discord_name} 발송 완료`);
}

// 구절 목록 텍스트 생성 헬퍼 함수
function buildVerseListText(reviewVerses, newVerse) {
  const lines = [];

  if (newVerse) {
    lines.push(`🆕 **새 구절**: ${newVerse.reference} — "${newVerse.text_short || newVerse.text.substring(0, 30)}..."`);
  }

  reviewVerses.slice(0, 5).forEach((verse, i) => {
    lines.push(`${i + 1}. ${verse.reference} *(복습)*`);
  });

  if (reviewVerses.length > 5) {
    lines.push(`... 외 ${reviewVerses.length - 5}구절 더`);
  }

  return lines.join('\n');
}

// 지정된 밀리초만큼 대기하는 유틸리티
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startDailyScheduler, sendDailyReminders };
```

---

### 6.4 버튼 인터랙션 핸들러

`src/interactions/buttons.js`:

```javascript
// ================================================
// 버튼 클릭 이벤트 처리
// ================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../database/init');
const { updateProgress } = require('../services/progress');

// 버튼 클릭 시 호출되는 메인 핸들러
async function handleButton(interaction, client) {
  // customId 형식: "액션:멤버ID:날짜"
  const [action, memberId, date] = interaction.customId.split(':');

  switch (action) {

    // ── ✅ 다 했어요 ──────────────────────────────
    case 'complete_all': {
      await interaction.deferUpdate(); // "생각 중..." 표시 방지

      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(memberId, date);

      if (!log) {
        await interaction.followUp({ content: '오늘 기록을 찾을 수 없습니다.', ephemeral: true });
        return;
      }

      // 이미 완료 처리된 경우
      if (log.status === 'complete') {
        await interaction.followUp({ content: '이미 오늘 완료 처리되었습니다! 수고하셨어요 🙏', ephemeral: true });
        return;
      }

      // DB에 완료 기록
      db.prepare(`
        UPDATE daily_logs SET status = 'complete', verses_done = verses_total WHERE id = ?
      `).run(log.id);

      // 연속 완료 일수 증가
      db.prepare('UPDATE members SET streak = streak + 1 WHERE id = ?').run(memberId);

      // 모든 오늘의 구절 진도 업데이트 (복습 성공으로 기록)
      await updateProgress(memberId, date, 'complete');

      // 인증 채널에 게시
      await postCertification(client, member, log.verses_total, 'complete');

      // DM 메시지 업데이트 (버튼 비활성화)
      const doneEmbed = new EmbedBuilder()
        .setColor(0x57F287) // 초록색
        .setTitle('✅ 오늘 암송 완료!')
        .setDescription(`수고하셨습니다! 오늘도 말씀을 붙드셨네요 🙏\n연속 완료: **${member.streak + 1}일**`)
        .setTimestamp();

      await interaction.editReply({ embeds: [doneEmbed], components: [] });
      break;
    }

    // ── 🔢 일부만 했어요 ─────────────────────────
    case 'complete_partial': {
      await interaction.deferUpdate();

      const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(memberId, date);
      const total = log ? log.verses_total : 5;

      // 1부터 (total-1)까지의 숫자 버튼 생성
      const buttons = [];
      for (let i = 1; i < total; i++) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`partial_count:${memberId}:${date}:${i}`)
            .setLabel(`${i}구절`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      // 버튼을 5개씩 한 행에 배치 (Discord 최대 5개/행)
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      await interaction.editReply({
        content: `몇 구절 완료하셨나요? (전체 ${total}구절 중)`,
        components: rows
      });
      break;
    }

    // ── 숫자 버튼 (partial_count) ────────────────
    case 'partial_count': {
      await interaction.deferUpdate();
      const count = parseInt(interaction.customId.split(':')[3]);

      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(memberId, date);

      // DB에 부분 완료 기록
      db.prepare(`
        UPDATE daily_logs SET status = 'partial', verses_done = ? WHERE id = ?
      `).run(count, log.id);

      // 연속 일수 유지 (부분 완료는 streak 증가 없음, 초기화도 없음)

      // 부분 완료는 인증 채널에 게시하지 않음 (수치심 없는 UX)

      const partialEmbed = new EmbedBuilder()
        .setColor(0xFEE75C) // 노란색
        .setTitle('🔢 부분 완료 기록됨')
        .setDescription(`오늘 **${count}구절** 완료를 기록했습니다.\n내일도 함께해요! 💪`)
        .setTimestamp();

      await interaction.editReply({ embeds: [partialEmbed], components: [] });
      break;
    }

    // ── 😴 오늘은 쉴게요 ─────────────────────────
    case 'skip_today': {
      await interaction.deferUpdate();

      const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(memberId, date);

      // DB에 스킵 기록 (연속 일수 초기화 없음 — 한 번 쉰다고 streak 리셋 안 함)
      db.prepare(`
        UPDATE daily_logs SET status = 'skipped' WHERE id = ?
      `).run(log.id);

      // 스킵도 채널에 게시하지 않음

      const skipEmbed = new EmbedBuilder()
        .setColor(0x99AAB5) // 회색
        .setTitle('😴 오늘 하루 쉬어가요')
        .setDescription('괜찮아요, 쉬는 것도 필요합니다.\n내일 다시 말씀과 함께해요 🌅')
        .setTimestamp();

      await interaction.editReply({ embeds: [skipEmbed], components: [] });
      break;
    }

    // ── 📖 구절 보기 ─────────────────────────────
    case 'view_verses': {
      // ephemeral: true — 본인에게만 보이는 임시 메시지
      await interaction.deferReply({ ephemeral: true });

      const todayVerses = await getTodayVerses(memberId, date);

      const verseTexts = todayVerses.map((v, i) =>
        `**${i + 1}. ${v.reference}**\n"${v.text}"`
      ).join('\n\n');

      const verseEmbed = new EmbedBuilder()
        .setColor(0x4A90D9)
        .setTitle('📖 오늘의 암송 구절')
        .setDescription(verseTexts || '오늘 배정된 구절이 없습니다.')
        .setFooter({ text: '본인에게만 보이는 메시지입니다' });

      // 구절 확인 후 완료 버튼도 다시 표시
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_all:${memberId}:${date}`)
          .setLabel('✅ 다 했어요!')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`complete_partial:${memberId}:${date}`)
          .setLabel('🔢 일부만 했어요')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.editReply({ embeds: [verseEmbed], components: [actionRow] });
      break;
    }
  }
}

// 암송 인증 채널에 완료 게시
async function postCertification(client, member, verseCount, status) {
  const channel = await client.channels.fetch(process.env.CERTIFICATION_CHANNEL_ID);
  if (!channel) return;

  const streakEmoji = member.streak >= 30 ? '🔥🔥🔥' : member.streak >= 14 ? '🔥🔥' : member.streak >= 7 ? '🔥' : '✨';

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`${streakEmoji} 암송 완료!`)
    .setDescription(`<@${member.discord_id}>님이 오늘 **${verseCount}구절** 암송을 완료하셨습니다!`)
    .addFields(
      { name: '연속 완료', value: `${member.streak + 1}일`, inline: true },
      { name: '완료 시간', value: new Date().toLocaleTimeString('ko-KR'), inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// 오늘의 구절 목록 조회
async function getTodayVerses(memberId, date) {
  return db.prepare(`
    SELECT v.reference, v.text, v.text_short
    FROM member_progress mp
    JOIN verses v ON mp.verse_id = v.id
    WHERE mp.member_id = ?
      AND date(mp.next_review_at) <= date(?)
    ORDER BY mp.next_review_at ASC
    LIMIT 20
  `).all(memberId, date);
}

module.exports = { handleButton };
```

---

### 6.5 주간 리포트 이미지 생성

`src/services/report.js`:

```javascript
// ================================================
// node-canvas를 이용한 주간 리포트 이미지 생성
// ================================================

const { createCanvas, registerFont } = require('canvas');
const path = require('path');

// 이미지 크기 및 레이아웃 상수
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const PADDING = 40;
const ROW_HEIGHT = 50;
const HEADER_HEIGHT = 120;

// 색상 팔레트
const COLORS = {
  background: '#1a1a2e',   // 어두운 남색 배경
  cardBg: '#16213e',       // 카드 배경
  accent: '#0f3460',       // 강조 배경
  gold: '#e2b04a',         // MVP 강조 색상
  complete: '#57F287',     // 완료 초록
  partial: '#FEE75C',      // 부분 완료 노랑
  skip: '#747F8D',         // 스킵 회색
  text: '#FFFFFF',         // 기본 텍스트 (흰색)
  textMuted: '#B9BBBE',    // 흐린 텍스트
  headerText: '#E2B04A',   // 헤더 텍스트 (금색)
};

// 주간 리포트 이미지를 생성하고 Buffer로 반환
async function generateWeeklyReport(membersData, weekLabel) {
  /*
    membersData 형식:
    [
      {
        name: '홍길동',
        streak: 14,
        thisWeek: 6,      // 이번 주 완료 일수 (7일 중)
        totalVerses: 25,  // 암기 완료한 총 구절 수
        rate: 0.85,       // 완료율 (0~1)
      },
      ...
    ]
  */

  // 캔버스 생성
  const height = HEADER_HEIGHT + PADDING + (membersData.length * ROW_HEIGHT) + PADDING + 80;
  const canvas = createCanvas(CANVAS_WIDTH, Math.max(height, CANVAS_HEIGHT));
  const ctx = canvas.getContext('2d');

  // ── 배경 그리기 ─────────────────────────────
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 상단 장식 그라디언트 바
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  gradient.addColorStop(0, '#4A90D9');
  gradient.addColorStop(0.5, '#7B68EE');
  gradient.addColorStop(1, '#4A90D9');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 6);

  // ── 헤더 ────────────────────────────────────
  ctx.fillStyle = COLORS.headerText;
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📖 성경 암송 주간 리포트', CANVAS_WIDTH / 2, 55);

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '18px sans-serif';
  ctx.fillText(weekLabel, CANVAS_WIDTH / 2, 85);

  // ── 컬럼 헤더 ───────────────────────────────
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(PADDING, HEADER_HEIGHT, CANVAS_WIDTH - PADDING * 2, ROW_HEIGHT);

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  const cols = { name: 70, streak: 280, week: 420, total: 570, rate: 720 };
  ctx.fillText('이름', cols.name, HEADER_HEIGHT + 32);
  ctx.fillText('연속 완료', cols.streak, HEADER_HEIGHT + 32);
  ctx.fillText('이번 주', cols.week, HEADER_HEIGHT + 32);
  ctx.fillText('암기 완료', cols.total, HEADER_HEIGHT + 32);
  ctx.fillText('완료율', cols.rate, HEADER_HEIGHT + 32);

  // ── MVP 찾기 (완료율 기준) ───────────────────
  const mvp = membersData.reduce((best, m) => m.rate > best.rate ? m : best, membersData[0]);

  // ── 멤버 데이터 행 그리기 ────────────────────
  membersData.forEach((member, index) => {
    const y = HEADER_HEIGHT + ROW_HEIGHT + (index * ROW_HEIGHT);
    const isMvp = member.name === mvp.name;

    // 행 배경 (MVP는 특별 색상)
    ctx.fillStyle = isMvp ? '#1a1a00' : (index % 2 === 0 ? COLORS.cardBg : COLORS.background);
    ctx.fillRect(PADDING, y, CANVAS_WIDTH - PADDING * 2, ROW_HEIGHT);

    // MVP 왼쪽 강조 바
    if (isMvp) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(PADDING, y, 4, ROW_HEIGHT);
    }

    ctx.textAlign = 'left';
    ctx.font = isMvp ? 'bold 16px sans-serif' : '16px sans-serif';

    // 이름
    ctx.fillStyle = isMvp ? COLORS.gold : COLORS.text;
    ctx.fillText(isMvp ? `👑 ${member.name}` : member.name, cols.name, y + 32);

    // 연속 완료
    ctx.fillStyle = member.streak >= 7 ? COLORS.complete : COLORS.textMuted;
    ctx.fillText(`${member.streak}일 🔥`, cols.streak, y + 32);

    // 이번 주 완료 (7칸 도트 표시)
    drawWeekDots(ctx, member.thisWeek, cols.week, y + 28);

    // 암기 완료 구절 수
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${member.totalVerses}구절`, cols.total, y + 32);

    // 완료율 바 차트
    drawProgressBar(ctx, member.rate, cols.rate, y + 18, 120, 16);
  });

  // ── 하단 푸터 ────────────────────────────────
  const footerY = HEADER_HEIGHT + ROW_HEIGHT + (membersData.length * ROW_HEIGHT) + 30;
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `생성 시간: ${new Date().toLocaleString('ko-KR')} | 성경암송팀 봇`,
    CANVAS_WIDTH / 2,
    footerY
  );

  // PNG Buffer로 반환
  return canvas.toBuffer('image/png');
}

// 이번 주 7일 완료 현황을 점으로 표시
function drawWeekDots(ctx, doneCount, x, y) {
  const dotSize = 14;
  const gap = 4;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(x + i * (dotSize + gap) + dotSize / 2, y, dotSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = i < doneCount ? COLORS.complete : COLORS.skip;
    ctx.fill();
  }
}

// 완료율 프로그레스 바 그리기
function drawProgressBar(ctx, rate, x, y, width, height) {
  // 배경 바
  ctx.fillStyle = '#2c2c4a';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();

  // 완료 바
  const fillWidth = Math.max(width * rate, rate > 0 ? height : 0);
  const color = rate >= 0.8 ? COLORS.complete : rate >= 0.5 ? COLORS.partial : COLORS.skip;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, fillWidth, height, height / 2);
  ctx.fill();

  // 퍼센트 텍스트
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(rate * 100)}%`, x + width + 35, y + height - 2);
}

module.exports = { generateWeeklyReport };
```

---

### 6.6 동기부여 말씀 모음

`src/utils/bible-verses.js`:

```javascript
// ================================================
// 매일 DM에 포함될 동기부여 성경 말씀 모음
// 봇이 매일 순서대로 또는 랜덤으로 선택합니다
// ================================================

const MOTIVATIONAL_VERSES = [
  { reference: '빌 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라' },
  { reference: '수 1:8', text: '이 율법책을 네 입에서 떠나지 말게 하며 주야로 그것을 묵상하여 그 안에 기록된 대로 다 지켜 행하라 그리하면 네 길이 평탄하게 될 것이며 네가 형통하리라' },
  { reference: '시 119:11', text: '내가 주께 범죄하지 아니하려 하여 주의 말씀을 내 마음에 두었나이다' },
  { reference: '롬 10:17', text: '그러므로 믿음은 들음에서 나며 들음은 그리스도의 말씀으로 말미암았느니라' },
  { reference: '시 1:2-3', text: '오직 여호와의 율법을 즐거워하여 그의 율법을 주야로 묵상하는도다 그는 시냇가에 심은 나무가 철을 따라 열매를 맺으며 그 잎사귀가 마르지 아니함 같으니' },
  { reference: '골 3:16', text: '그리스도의 말씀이 너희 속에 풍성히 거하여 모든 지혜로 피차 가르치며 권면하고' },
  { reference: '요 15:7', text: '너희가 내 안에 거하고 내 말이 너희 안에 거하면 무엇이든지 원하는 대로 구하라 그리하면 이루리라' },
  { reference: '시 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다' },
  { reference: '히 4:12', text: '하나님의 말씀은 살아 있고 활력이 있어 좌우에 날선 어떤 검보다도 예리하여' },
  { reference: '마 4:4', text: '사람이 떡으로만 살 것이 아니요 하나님의 입으로부터 나오는 모든 말씀으로 살 것이라' },
  { reference: '딤후 3:16-17', text: '모든 성경은 하나님의 감동으로 된 것으로 교훈과 책망과 바르게 함과 의로 교육하기에 유익하니 이는 하나님의 사람으로 온전하게 하며' },
  { reference: '잠 4:20-22', text: '내 아들아 내 말에 주의하며 내가 말하는 것에 네 귀를 기울이라 그것을 네 눈에서 떠나게 하지 말며 네 마음속에 지키라 그것은 얻는 자에게 생명이 되며' },
  { reference: '롬 12:2', text: '너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아 하나님의 선하시고 기뻐하시고 온전하신 뜻이 무엇인지 분별하도록 하라' },
  { reference: '엡 6:17', text: '구원의 투구와 성령의 검 곧 하나님의 말씀을 가지라' },
  { reference: '약 1:22', text: '너희는 말씀을 행하는 자가 되고 듣기만 하여 자신을 속이는 자가 되지 말라' },
  { reference: '시 19:7', text: '여호와의 율법은 완전하여 영혼을 소성시키며 여호와의 증거는 확실하여 우둔한 자를 지혜롭게 하며' },
  { reference: '신 6:6-7', text: '오늘 내가 네게 명하는 이 말씀을 너는 마음에 새기고 네 자녀에게 부지런히 가르치며' },
  { reference: '잠 3:5-6', text: '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라' },
  { reference: '시 37:31', text: '그의 마음에는 하나님의 법이 있으니 그의 걸음은 실족함이 없으리로다' },
  { reference: '렘 15:16', text: '만군의 하나님 여호와시여 나는 주의 이름으로 일컬음을 받는 자라 내가 주의 말씀을 얻어 먹었사오니 주의 말씀은 내게 기쁨과 내 마음의 즐거움이오나' },
  { reference: '이사야 40:8', text: '풀은 마르고 꽃은 시드나 우리 하나님의 말씀은 영원히 서리라 하라' },
  { reference: '마 24:35', text: '천지는 없어지겠으나 내 말은 없어지지 아니하리라' },
  { reference: '벧전 2:2', text: '갓난 아기들 같이 순전하고 신령한 젖을 사모하라 이는 그로 말미암아 너희로 구원에 이르도록 자라게 하려 함이라' },
  { reference: '행 17:11', text: '베뢰아에 있는 사람들은 데살로니가에 있는 사람들보다 더 너그러워서 간절한 마음으로 말씀을 받고 이것이 그러한가 하여 날마다 성경을 상고하므로' },
  { reference: '시 119:9', text: '청년이 무엇으로 그의 행실을 깨끗하게 하리이까 주의 말씀만 지킬 따름이니이다' },
  { reference: '느 8:10', text: '여호와로 인하여 기뻐하는 것이 너희의 힘이니라' },
  { reference: '시 34:8', text: '너희는 여호와의 선하심을 맛보아 알지어다 그에게 피하는 자는 복이 있도다' },
  { reference: '롬 8:28', text: '우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라' },
  { reference: '고전 10:13', text: '사람이 감당할 시험 밖에는 너희가 당한 것이 없나니 오직 하나님은 미쁘사 너희가 감당하지 못할 시험 당함을 허락하지 아니하시고' },
  { reference: '갈 6:9', text: '우리가 선을 행하되 낙심하지 말지니 포기하지 아니하면 때가 이르매 거두리라' },
  { reference: '시 119:160', text: '주의 말씀의 강령은 진리이오니 주의 의로운 모든 규례들은 영원하리이다' },
  { reference: '골 1:29', text: '이를 위하여 나도 내 속에서 능력으로 역사하시는 이의 역사를 따라 힘을 다하여 수고하노라' },
  { reference: '빌 3:14', text: '푯대를 향하여 그리스도 예수 안에서 하나님이 위에서 부르신 부름의 상을 위하여 달려가노라' },
  { reference: '시 143:10', text: '주는 나의 하나님이시니 주의 영이 선하시니 나를 평탄한 땅에 인도하소서' },
  { reference: '잠 2:6', text: '대저 여호와는 지혜를 주시며 지식과 명철은 그의 입에서 나오며' },
  { reference: '요 8:31-32', text: '너희가 내 말에 거하면 참으로 내 제자가 되고 진리를 알지니 진리가 너희를 자유롭게 하리라' },
  { reference: '호 4:6', text: '내 백성이 지식이 없으므로 망하는도다' },
  { reference: '딤전 4:15', text: '이것들을 공부하고 이 일에 전심전력하여 너의 성숙함을 모든 사람에게 나타나게 하라' },
  { reference: '살전 5:16-18', text: '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라' },
  { reference: '수 1:9', text: '내가 네게 명령한 것이 아니냐 강하고 담대하라 두려워하지 말며 놀라지 말라' },
  { reference: '시 46:1', text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라' },
  { reference: '사 26:3', text: '주께서 심지가 견고한 자를 평강하고 평강하도록 지키시리니 이는 그가 주를 신뢰함이니이다' },
  { reference: '빌 4:6-7', text: '아무것도 염려하지 말고 다만 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라 그리하면 모든 지각에 뛰어난 하나님의 평강이 너희 마음과 생각을 지키시리라' },
  { reference: '사 40:31', text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요' },
  { reference: '엡 3:20', text: '우리 가운데서 역사하시는 능력대로 우리가 구하거나 생각하는 모든 것에 더 넘치도록 능히 하실 이에게' },
  { reference: '렘 29:11', text: '여호와의 말씀이니라 너희를 향한 나의 생각을 내가 아나니 평안이요 재앙이 아니니라 너희에게 미래와 희망을 주는 것이니라' },
  { reference: '시 23:6', text: '내 평생에 선하심과 인자하심이 반드시 나를 따르리니 내가 여호와의 집에 영원히 살리로다' },
  { reference: '요일 4:4', text: '자녀들아 너희는 하나님께 속하였고 또 그들을 이기었나니 이는 너희 안에 계신 이가 세상에 있는 자보다 크심이라' },
  { reference: '딤전 6:12', text: '믿음의 선한 싸움을 싸우라 영생을 취하라 이를 위하여 네가 부르심을 받았고' },
  { reference: '시 27:1', text: '여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요' },
];

// 매일 다른 말씀을 반환 (날짜 기반 순환)
function getMotivationalVerse() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  return MOTIVATIONAL_VERSES[dayOfYear % MOTIVATIONAL_VERSES.length];
}

// 랜덤 말씀 반환
function getRandomVerse() {
  return MOTIVATIONAL_VERSES[Math.floor(Math.random() * MOTIVATIONAL_VERSES.length)];
}

module.exports = { getMotivationalVerse, getRandomVerse, MOTIVATIONAL_VERSES };
```

---

## 7. 환경 변수 & 설정

`.env` 파일을 프로젝트 루트에 만들고 아래 내용을 입력합니다.
(`.env` 파일은 절대 GitHub에 올리면 안 됩니다!)

```env
# ================================================
# Discord 봇 인증 정보
# ================================================

# Discord Developer Portal > Bot > Token 에서 복사
DISCORD_TOKEN=your_bot_token_here

# 서버 ID: Discord에서 서버 이름 우클릭 > "ID 복사" (개발자 모드 필요)
GUILD_ID=your_guild_id_here

# ================================================
# 채널 ID 설정
# ================================================

# #암송-인증 채널 ID
CERTIFICATION_CHANNEL_ID=your_certification_channel_id

# #진도표 채널 ID
PROGRESS_CHANNEL_ID=your_progress_channel_id

# #봇-설정 채널 ID
ADMIN_CHANNEL_ID=your_admin_channel_id

# ================================================
# 스케줄 설정
# ================================================

# 매일 DM 알림 시간 (24시간 형식, 한국 시간 기준)
DAILY_REMINDER_TIME=07:00

# 신규 구절 배정 요일 (monday/tuesday/wednesday/thursday/friday/saturday/sunday)
NEW_VERSE_DAY=wednesday

# 주간 리포트 발송 요일
WEEKLY_REPORT_DAY=sunday

# 주간 리포트 발송 시간
WEEKLY_REPORT_TIME=20:00

# 타임존 (변경 불필요)
TIMEZONE=Asia/Seoul

# ================================================
# 봇 동작 설정
# ================================================

# 개발 환경 여부 (development / production)
NODE_ENV=production

# SQLite DB 파일 경로
DATABASE_PATH=./data/bible-bot.db
```

---

`.gitignore` 파일 내용:

```gitignore
# 환경변수 파일 (절대 올리지 않음)
.env

# 데이터베이스 파일
data/*.db
data/*.db-journal
data/*.db-shm
data/*.db-wal

# Node.js
node_modules/
npm-debug.log*

# 시스템 파일
.DS_Store
Thumbs.db

# 임시 파일
*.tmp
*.log
```

---

## 8. 로컬 개발 & 테스트

### 8.1 개발 환경 설정

**필수 설치 목록:**

| 항목 | 버전 | 설치 방법 |
|------|------|----------|
| Node.js | 18 이상 | https://nodejs.org 에서 LTS 버전 다운로드 |
| npm | Node.js 설치 시 자동 포함 | — |
| Git | 최신 버전 | https://git-scm.com |

**설치 확인:**

```bash
# 터미널(맥: 터미널 앱, 윈도우: PowerShell)에서 실행
node --version    # v18.x.x 이상이어야 함
npm --version     # 9.x.x 이상이어야 함
git --version     # 아무 버전이나 OK
```

**프로젝트 초기화:**

```bash
# 1. 프로젝트 폴더 만들기
mkdir bible-memorization-bot
cd bible-memorization-bot

# 2. Git 초기화
git init

# 3. npm 초기화 (package.json 생성)
npm init -y

# 4. 필수 패키지 설치
npm install discord.js@14 better-sqlite3 canvas node-cron dotenv

# 5. 개발용 패키지 설치 (코드 변경 시 자동 재시작)
npm install -D nodemon

# 6. 폴더 구조 생성
mkdir -p src/database src/commands src/interactions src/scheduler src/services src/utils data/curriculum
```

**package.json 수정:**

`scripts` 섹션을 아래와 같이 수정합니다:

```json
{
  "name": "bible-memorization-bot",
  "version": "1.0.0",
  "description": "성경 암송 디스코드 봇",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test:dm": "node scripts/test-dm.js",
    "test:report": "node scripts/test-report.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 8.2 봇 실행

```bash
# 1. .env 파일 작성 (위의 7절 내용 참고)
# (직접 파일 만들거나 .env.example 복사 후 수정)
cp .env.example .env
# 텍스트 에디터로 .env 파일 열어서 실제 값 입력

# 2. 개발 모드로 실행 (코드 변경 시 자동 재시작)
npm run dev

# 3. 프로덕션 모드로 실행
npm start
```

터미널에 아래 메시지가 출력되면 성공입니다:
```
✅ 봇 로그인 완료: 암송봇#1234
✅ 데이터베이스 초기화 완료
✅ 슬래시 커맨드 등록 완료
✅ 스케줄러 시작 완료
🙏 성경 암송 봇이 준비되었습니다!
```

---

### 8.3 테스트 방법

**테스트용 개인 서버 만들기:**

본인만 있는 테스트 서버를 별도로 만들어 거기서 개발하는 것을 강력히 추천합니다.
위 [2.1 서버 생성] 과정으로 `암송봇-테스트` 서버를 만들고, 그 서버에 봇을 초대합니다.

**기능별 테스트 체크리스트:**

```
[ ] 봇이 서버에 온라인으로 표시되는지 확인
[ ] /등록 커맨드로 본인 등록
[ ] /진도 커맨드로 진도 확인
[ ] /관리 알림테스트 로 DM 알림 즉시 발송 테스트
[ ] DM에서 버튼 클릭 테스트 (✅ 다 했어요)
[ ] #암송-인증 채널에 완료 인증이 자동 게시되는지 확인
[ ] /관리 리포트 로 주간 리포트 즉시 발송 테스트
[ ] #진도표 채널에 이미지가 올라오는지 확인
```

---

## 9. Railway 배포

Railway는 Node.js 앱을 무료로 호스팅할 수 있는 서비스입니다.
무료 티어 기준으로 월 약 5달러 상당의 크레딧이 제공됩니다.

### 9.1 Railway 계정 생성

1. `https://railway.app` 에 접속합니다.
2. **"Login with GitHub"** 버튼을 클릭합니다.
3. GitHub 계정이 없다면 먼저 `https://github.com` 에서 회원가입합니다.
4. Railway와 GitHub 연동을 허용합니다.

---

### 9.2 GitHub 연동

**코드를 GitHub에 올리기:**

```bash
# 1. GitHub에서 새 저장소(Repository) 만들기
# github.com 접속 > 우측 상단 + 버튼 > "New repository"
# Repository name: bible-memorization-bot
# Private 선택 (코드를 비공개로)
# "Create repository" 클릭

# 2. 로컬 코드를 GitHub에 올리기 (터미널에서)
git add .
git commit -m "feat: initial bot setup"
git branch -M main
git remote add origin https://github.com/본인아이디/bible-memorization-bot.git
git push -u origin main
```

---

### 9.3 Railway에 프로젝트 배포

1. Railway 대시보드에서 **"New Project"** 버튼을 클릭합니다.
2. **"Deploy from GitHub repo"** 를 선택합니다.
3. 방금 만든 `bible-memorization-bot` 저장소를 선택합니다.
4. Railway가 자동으로 Node.js 앱을 감지하고 배포를 시작합니다.

---

### 9.4 환경변수 설정

코드에서 `.env` 파일을 읽지만, Railway에는 이 파일을 올리지 않았습니다.
Railway 대시보드에서 직접 환경변수를 설정해야 합니다.

1. Railway 프로젝트 페이지에서 배포된 서비스를 클릭합니다.
2. 상단 탭에서 **"Variables"** 를 클릭합니다.
3. **"Add Variable"** 버튼을 클릭하고 `.env` 파일의 내용을 하나씩 입력합니다:

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | 봇 토큰 |
| `GUILD_ID` | 서버 ID |
| `CERTIFICATION_CHANNEL_ID` | #암송-인증 채널 ID |
| `PROGRESS_CHANNEL_ID` | #진도표 채널 ID |
| `ADMIN_CHANNEL_ID` | #봇-설정 채널 ID |
| `DAILY_REMINDER_TIME` | `07:00` |
| `NEW_VERSE_DAY` | `wednesday` |
| `WEEKLY_REPORT_DAY` | `sunday` |
| `WEEKLY_REPORT_TIME` | `20:00` |
| `TIMEZONE` | `Asia/Seoul` |
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/app/data/bible-bot.db` |

4. 모든 변수 입력 후 자동으로 재배포가 시작됩니다.

---

**railway.json 파일 만들기** (프로젝트 루트에):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node src/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

### 9.5 배포 & 모니터링

**배포 확인:**

1. Railway 대시보드에서 **"Deployments"** 탭으로 이동합니다.
2. 최신 배포가 초록색 **"Active"** 상태인지 확인합니다.
3. **"View Logs"** 를 클릭하면 실시간 로그를 볼 수 있습니다.
4. 봇 로그인 완료 메시지가 보이면 성공입니다.

**로그 모니터링:**

Railway의 로그 뷰어에서 매일 알림 발송 현황, 에러 등을 확인할 수 있습니다.

---

### 9.6 무료 티어 제한사항 & 대안

| 항목 | Railway 무료 | 비고 |
|------|-------------|------|
| 월 크레딧 | $5 상당 | 봇 하나는 충분 |
| 연속 가동 | 최대 500시간/월 | 24*30 = 720시간이라 주의 |
| 슬립 | 없음 (항상 켜짐) | Render 무료는 슬립 있음 |
| 데이터베이스 | SQLite 파일로 로컬 | 재배포 시 데이터 유지 주의 |

> **중요**: Railway 무료 티어에서 컨테이너가 재시작되면 `/app/data/` 디렉토리의 SQLite 파일이 초기화될 수 있습니다. 이를 방지하려면 Railway의 **Volume** 기능을 사용합니다 (유료 기능) 또는 아래 대안을 고려합니다.

**대안 1: Render (무료, 슬립 있음)**
- `https://render.com` — 무료이지만 15분 비활동 시 슬립
- 알림 발송 시에만 깨어나는 방식이면 사용 가능

**대안 2: Fly.io (무료 티어 있음)**
- `https://fly.io` — 월 3개 VM 무료, Volume 스토리지 3GB 무료
- SQLite 영구 보관에 적합

**대안 3: 집 PC 또는 라즈베리파이 24시간 운영**
- 전기세만 발생, 인터넷 연결 필요
- 가장 안정적이고 데이터 소실 걱정 없음

---

## 10. 운영 가이드

### 10.1 새 멤버 추가

새 팀원이 디스코드 서버에 들어온 후 다음 단계를 안내합니다:

1. 서버의 아무 채널에서 `/등록` 을 입력합니다.
2. 봇이 코스 선택 메뉴를 보여줍니다.
3. 원하는 코스를 선택합니다.
4. 하루 목표 구절 수를 선택합니다 (기본 5구절).
5. 등록 완료! 다음 날 아침부터 DM 알림이 시작됩니다.

> 처음 등록하는 경우 당일 저녁에 첫 DM 발송을 원하면 관리자가 `/관리 알림테스트`를 실행합니다.

---

### 10.2 코스/구절 데이터 관리

구절 데이터는 `data/curriculum/` 폴더의 JSON 파일로 관리됩니다.
봇이 시작될 때 이 파일들을 읽어 데이터베이스에 삽입합니다.

**데이터 수정 후 반영 방법:**
1. JSON 파일을 수정합니다.
2. GitHub에 commit & push 합니다.
3. Railway가 자동으로 재배포합니다.
4. 봇 시작 시 DB를 다시 초기화합니다.

> 기존 멤버의 진도 데이터는 별도 테이블(`member_progress`)에 있으므로 구절 데이터 수정으로 삭제되지 않습니다.

---

### 10.3 커리큘럼 JSON 포맷

`data/curriculum/course1-intro.json` 예시:

```json
{
  "course_id": 1,
  "course_name": "입문",
  "description": "성경 암송을 처음 시작하는 분들을 위한 기초 코스",
  "total_verses": 5,
  "verses": [
    {
      "order": 1,
      "reference": "요 3:16",
      "text": "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
      "text_short": "하나님이 세상을 이처럼 사랑하사..."
    },
    {
      "order": 2,
      "reference": "빌 4:13",
      "text": "내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라",
      "text_short": "내게 능력 주시는 자 안에서..."
    },
    {
      "order": 3,
      "reference": "시 23:1",
      "text": "여호와는 나의 목자시니 내게 부족함이 없으리로다",
      "text_short": "여호와는 나의 목자시니..."
    },
    {
      "order": 4,
      "reference": "롬 8:28",
      "text": "우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라",
      "text_short": "하나님을 사랑하는 자에게는 모든 것이..."
    },
    {
      "order": 5,
      "reference": "잠 3:5-6",
      "text": "너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라",
      "text_short": "마음을 다하여 여호와를 신뢰하고..."
    }
  ]
}
```

---

### 10.4 백업 & 복원

**데이터베이스 백업:**

SQLite 파일(`data/bible-bot.db`)을 정기적으로 백업하는 것이 중요합니다.

```bash
# 매일 자동 백업 스크립트 (scripts/backup.js)
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || './data/bible-bot.db';
const backupDir = './data/backups';

// 백업 폴더 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 오늘 날짜로 백업 파일 이름 지정
const today = new Date().toISOString().split('T')[0];
const backupPath = path.join(backupDir, `bible-bot-${today}.db`);

// 파일 복사
fs.copyFileSync(dbPath, backupPath);
console.log(`백업 완료: ${backupPath}`);

// 7일 이상 된 백업 파일 삭제
const files = fs.readdirSync(backupDir);
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

files.forEach(file => {
  const filePath = path.join(backupDir, file);
  const stat = fs.statSync(filePath);
  if (stat.mtime < sevenDaysAgo) {
    fs.unlinkSync(filePath);
    console.log(`오래된 백업 삭제: ${file}`);
  }
});
```

**복원 방법:**

```bash
# 1. 봇 정지 (Railway에서 배포 일시 중단)
# 2. 백업 파일을 현재 DB 파일 위치로 복사
cp data/backups/bible-bot-YYYY-MM-DD.db data/bible-bot.db
# 3. 봇 재시작
```

---

### 10.5 주말 운영 모드

팀 일정에 따라 주말에는 알림을 보내지 않거나 다르게 운영할 수 있습니다.

**방법 1: 특정 요일 제외**

`src/scheduler/daily.js`에서 요일 확인 로직 추가:

```javascript
// 주말(토, 일) 알림 스킵 예시
const dayOfWeek = new Date().getDay(); // 0=일, 6=토
if (dayOfWeek === 0 || dayOfWeek === 6) {
  console.log('[알림] 주말은 알림 없음');
  return;
}
```

**방법 2: 개인별 알림 요일 설정**

`members` 테이블에 `active_days` 컬럼을 추가하고 개인별로 설정할 수 있습니다.

---

## 11. 확장 가이드

### 11.1 성경읽기 채널 추가

`#성경읽기` 채널에서 봇이 매일 아침 성경 읽기 계획도 안내하도록 확장합니다.

**추가 구현 포인트:**

```javascript
// src/scheduler/bible-reading.js
// 매일 아침 #성경읽기 채널에 오늘의 성경 읽기 범위를 게시
// 예: "오늘의 성경 읽기: 창세기 1~3장"
// 멤버들이 이모지로 완료 체크
```

---

### 11.2 기도제목 나눔

`#기도제목` 채널에서 일주일에 한 번 기도제목 나눔을 알림으로 요청합니다.

```javascript
// src/scheduler/prayer.js
// 매주 월요일 아침 #기도제목 채널에 나눔 요청 게시
```

---

### 11.3 웹 대시보드 (Supabase + Next.js)

더 발전된 운영을 원하면 웹 대시보드를 추가할 수 있습니다.

**구현 스택:**
- **Supabase**: PostgreSQL DB + 인증 (무료)
- **Next.js**: 대시보드 웹앱 (Vercel에 무료 배포)

**제공 기능:**
- 팀 전체 진도 현황 웹 페이지
- 관리자 멤버 관리 패널
- 구절 데이터 편집 인터페이스
- 통계 차트 (Chart.js)

SQLite 대신 Supabase를 사용하려면 `better-sqlite3`를 `@supabase/supabase-js`로 교체합니다.

---

## 12. 트러블슈팅

### 봇이 오프라인일 때

**증상**: 디스코드에서 봇이 회색(오프라인)으로 표시됨

**확인 방법:**
1. Railway 대시보드 → 해당 서비스 → **Logs** 확인
2. 에러 메시지 찾기

**주요 원인 & 해결책:**

| 원인 | 해결책 |
|------|--------|
| 봇 토큰이 잘못됨 | Developer Portal에서 토큰 재생성 후 Railway 환경변수 업데이트 |
| Railway 크레딧 소진 | Railway 대시보드에서 크레딧 확인, 필요시 결제 방법 추가 |
| 코드 오류로 충돌 | 로그에서 에러 메시지 확인 후 코드 수정 |
| 의존성 설치 실패 | `npm install` 오류 확인, package.json 수정 |

---

### DM이 안 갈 때

**증상**: 오전 7시가 지났는데 DM이 오지 않음

**확인 순서:**

1. 봇이 온라인인지 확인 (위 참조)
2. Railway 로그에서 알림 발송 기록 확인:
   ```
   [알림] 오늘의 암송 알림 발송 시작
   [알림] 홍길동 발송 완료
   ```
3. 디스코드 설정 확인: `설정 → 개인정보 보호 → 서버 멤버들이 보내는 다이렉트 메시지 허용` 켜기
4. 봇 차단 여부 확인

---

### 버튼이 작동 안 할 때

**증상**: DM의 버튼을 눌렀을 때 "이 상호 작용에 실패했습니다" 메시지

**원인 & 해결:**

| 원인 | 해결책 |
|------|--------|
| 봇이 재시작되어 이전 버튼의 상태를 잃음 | 봇이 온라인 상태인지 확인, 알림을 다시 받거나 `/관리 알림테스트` 실행 |
| 버튼 customId 형식 오류 | `buttons.js`에서 customId 파싱 로직 확인 |
| Discord 15분 타임아웃 | 버튼 클릭은 메시지 수신 후 15분 안에 해야 함 (Discord 제한) |

---

### Railway 배포 실패 시

**증상**: Railway 배포 탭에서 빨간색 Failed 상태

**확인 방법:**
1. Railway 배포 로그에서 빨간색 에러 라인 찾기
2. 흔한 오류들:

```bash
# 오류 1: canvas 빌드 실패
# → Railway의 nixpacks가 canvas 빌드 의존성이 없어서 발생
# 해결: railway.json에 빌드 설정 추가

# 오류 2: better-sqlite3 빌드 실패
# → Native 모듈이라 컴파일 필요
# 해결: Node.js 버전 일치 확인

# 오류 3: 환경변수 없음
# → .env 파일을 올리지 않아서
# 해결: Railway Variables에서 직접 추가
```

**canvas 빌드 오류 해결 (nixpacks.toml 파일 만들기):**

```toml
# nixpacks.toml — Railway 빌드 설정
[phases.setup]
nixPkgs = ["cairo", "pango", "libjpeg", "giflib", "librsvg"]
```

---

### DB 마이그레이션

**시나리오**: 기존 DB가 있는 상태에서 새 컬럼이나 테이블을 추가해야 할 때

```javascript
// src/database/migrate.js — 마이그레이션 스크립트

const db = require('./init');

// 기존 테이블에 컬럼 추가 (이미 있으면 무시)
function runMigrations() {
  const migrations = [
    // 예: streak 컬럼 추가
    `ALTER TABLE members ADD COLUMN streak INTEGER DEFAULT 0`,
    // 예: note 컬럼 추가
    `ALTER TABLE daily_logs ADD COLUMN note TEXT`,
  ];

  migrations.forEach(sql => {
    try {
      db.prepare(sql).run();
      console.log(`마이그레이션 성공: ${sql.substring(0, 50)}...`);
    } catch (e) {
      // "duplicate column name" 등 이미 있는 경우 무시
      if (!e.message.includes('duplicate column')) {
        console.error('마이그레이션 실패:', e.message);
      }
    }
  });
}

module.exports = { runMigrations };
```

---

## 마치며

이 가이드가 팀의 성경 암송 여정에 든든한 디지털 동반자가 되길 바랍니다.

기술적인 질문이 있거나 봇 기능을 더 추가하고 싶다면 이 가이드를 참고해 확장해 나가세요.

> *"주의 말씀은 내 발에 등이요 내 길에 빛이니이다"* — 시편 119:105

---

**문서 버전**: 1.0.0
**최종 수정**: 2025-03-28
**기술 스택**: Node.js 18 + discord.js v14 + better-sqlite3 + node-canvas + node-cron + Railway
