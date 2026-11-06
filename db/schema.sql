-- 블로그 발행 분석기 데이터베이스 (Supabase / Postgres)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 1) 한 번이라도 분석한 블로그
create table if not exists blogs (
  blog_id          text primary key,
  blog_name        text,
  nickname         text,
  topic            text,
  first_seen_at    timestamptz not null default now(),
  last_analyzed_at timestamptz not null default now()
);

-- 2) 매일 기록할 블로그 (등록한 블로그만 매일 방문자 수를 저장한다)
--    owner_id: 나중에 회원 기능을 붙이면 회원별 등록에 쓴다 (지금은 비워 둠)
create table if not exists watchlist (
  blog_id        text primary key references blogs(blog_id) on delete cascade,
  role           text,                       -- me / c1 / c2 등 처음 등록할 때의 역할
  owner_id       text,
  active         boolean not null default true,
  registered_at  timestamptz not null default now(),
  last_collected date                        -- 마지막으로 매일 저장한 날짜 (한국 날짜)
);
create index if not exists watchlist_due on watchlist (active, last_collected);

-- 3) 날짜별 '자정 시점 누적 방문자 수' → 하루 방문자 = 다음날 값 - 그날 값
create table if not exists daily_totals (
  blog_id        text not null references blogs(blog_id) on delete cascade,
  day            date not null,              -- 한국 날짜
  midnight_total bigint not null,
  collected_at   timestamptz not null default now(),
  primary key (blog_id, day)
);

-- 4) 분석 결과 기록 (블로그·날짜마다 한 줄, 같은 날 다시 분석하면 덮어씀)
create table if not exists snapshots (
  blog_id         text not null references blogs(blog_id) on delete cascade,
  day             date not null,
  taken_at        timestamptz not null default now(),
  neighbors       bigint,
  total_visitors  bigint,
  today_visitors  bigint,
  popular_sum     bigint,                    -- 지난주 인기글 조회수 합
  avg_likes       numeric,
  avg_comments    numeric,
  naver_mate      boolean,
  mate_topic      text,
  citations_month bigint,                    -- AI 브리핑 인용 (이번 달)
  influencer_home text,
  expo_shown      int,                       -- 제목 노출 정상 수
  expo_pending    int,
  expo_missing    int,
  expo_total      int,
  primary key (blog_id, day)
);

-- 서버(service_role)만 읽고 쓴다. 브라우저용 anon 키로는 접근 못 하게 RLS를 켜 두고 정책은 만들지 않는다.
alter table blogs        enable row level security;
alter table watchlist    enable row level security;
alter table daily_totals enable row level security;
alter table snapshots    enable row level security;
