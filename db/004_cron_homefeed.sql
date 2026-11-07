-- 4단계: 홈판 수집을 Supabase가 10분마다 직접 실행하게 한다 (GitHub 자동 실행 대신)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고,
-- 아래 '여기에_CRON_SECRET_값' 한 곳만 Vercel에 넣은 CRON_SECRET 값으로 바꾼 뒤 Run.
-- 여러 번 실행해도 안전하다 (값을 바꾸고 다시 실행하면 새 값으로 바뀐다).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 비밀번호는 Supabase 금고(Vault)에 암호화해서 보관한다
do $$
declare
  v   text := '여기에_CRON_SECRET_값';
  sid uuid;
begin
  if v = '여기에_CRON_SECRET_값' then raise exception 'CRON_SECRET 값을 넣고 다시 실행해 주세요.'; end if;
  select id into sid from vault.secrets where name = 'cron_secret';
  if sid is null then perform vault.create_secret(v, 'cron_secret');
  else perform vault.update_secret(sid, v); end if;
end $$;

-- 10분마다 홈판 수집 주소를 부른다 (같은 이름이면 새 설정으로 바뀐다)
select cron.schedule(
  'bubbleloglynn-homefeed',
  '*/10 * * * *',
  $job$
  select net.http_get(
    url := 'https://naver-blog-analyzer.vercel.app/api/cron-homefeed',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 60000
  );
  $job$
);

-- 확인용: 등록된 예약 작업
select jobid, jobname, schedule, active from cron.job where jobname = 'bubbleloglynn-homefeed';
