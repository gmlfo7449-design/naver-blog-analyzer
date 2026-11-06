-- 2단계: 회원과 회원별 블로그 등록
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 회원 정보 (로그인은 Supabase Auth가 맡고, 여기에는 요금제 등 서비스 정보만 둔다)
create table if not exists members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  plan       text not null default 'free',      -- free / pro (결제 붙이면 바뀜)
  created_at timestamptz not null default now()
);

-- 회원이 등록한 블로그: 내 블로그(me) 1개 + 경쟁 블로그(competitor) 여러 개
create table if not exists member_blogs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  blog_id    text not null,
  role       text not null check (role in ('me', 'competitor')),
  created_at timestamptz not null default now(),
  primary key (user_id, blog_id)
);
create index if not exists member_blogs_blog on member_blogs (blog_id);

-- 서버(비밀 키)만 읽고 쓴다
alter table members      enable row level security;
alter table member_blogs enable row level security;
