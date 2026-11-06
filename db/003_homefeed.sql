-- 3단계: 홈판 노출 기록
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 홈판·주제판에 뜬 블로그 글 (글마다 한 줄)
create table if not exists home_posts (
  log_no      text primary key,
  blog_id     text not null,
  title       text,
  thumbnail   text,
  created_at  timestamptz,               -- 글 발행 시각
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists home_posts_blog on home_posts (blog_id);

-- 날짜·탭별로 그 글이 몇 번의 수집에서 보였는지 (hits = 본 횟수)
create table if not exists home_hits (
  log_no      text not null,
  day         date not null,              -- 한국 날짜
  tab         text not null,              -- home = 메인 홈판, 그 밖에는 주제판 이름
  blog_id     text not null,
  hits        integer not null default 0,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (log_no, day, tab)
);
create index if not exists home_hits_blog_day on home_hits (blog_id, day);

-- 수집 실행 기록 (몇 번 확인했는지 = 노출 횟수의 분모)
create table if not exists home_runs (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  pages       integer,
  cards       integer,
  blog_posts  integer,
  errors      integer
);
create index if not exists home_runs_at on home_runs (ran_at);

-- 한 번의 수집 결과를 한꺼번에 저장 (본 횟수는 +1)
create or replace function home_hit(p jsonb) returns void
language sql security definer set search_path = public as $$
  insert into home_posts (log_no, blog_id, title, thumbnail, created_at)
  select distinct on (x.log_no) x.log_no, x.blog_id, x.title, x.thumbnail, x.created_at
  from jsonb_to_recordset(p) as x(log_no text, blog_id text, title text, thumbnail text, created_at timestamptz)
  on conflict (log_no) do update set last_seen = now(), title = coalesce(excluded.title, home_posts.title), thumbnail = coalesce(excluded.thumbnail, home_posts.thumbnail);

  insert into home_hits (log_no, day, tab, blog_id, hits)
  select distinct on (x.log_no, x.tab) x.log_no, (now() at time zone 'Asia/Seoul')::date, x.tab, x.blog_id, 1
  from jsonb_to_recordset(p) as x(log_no text, blog_id text, tab text)
  on conflict (log_no, day, tab) do update set hits = home_hits.hits + 1, last_seen = now();
$$;

-- 서버(비밀 키)만 읽고 쓴다. 이 함수도 서버만 부를 수 있게 막는다.
alter table home_posts enable row level security;
alter table home_hits  enable row level security;
alter table home_runs  enable row level security;
revoke execute on function home_hit(jsonb) from public, anon, authenticated;
