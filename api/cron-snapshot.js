// 매일 저장 (Vercel Cron): '등록한' 블로그 중 오늘 아직 저장하지 않은 블로그부터 '자정 시점 누적 방문자 수'를 저장한다.
// 자정 시점 누적 = 지금 누적 방문자 - 오늘 방문자 → 하루 중 언제 돌아도 같은 값이 나온다.
// 시간 제한(약 50초) 안에서 처리하고, 남은 블로그는 다음 실행이나 분석할 때 채운다.
const store = require('../lib/store');
const { fetchProfile } = require('../lib/naver-profile');

const BUDGET_MS = 50 * 1000;
const CONCURRENCY = 4;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(401, { error: 'unauthorized' });
  if (!store.enabled) return send(200, { skipped: '저장소가 연결되지 않았어요.' });
  const started = Date.now();
  const today = store.kstDate();
  const ids = await store.due(today, 2000);
  let ok = 0, fail = 0, i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < ids.length && Date.now() - started < BUDGET_MS) {
      const id = ids[i++];
      try {
        const r = await fetchProfile(id);
        if (typeof r.totalVisitorCount === 'number' && typeof r.dayVisitorCount === 'number') {
          await store.saveTotal(id, today, r.totalVisitorCount - r.dayVisitorCount); ok++;
        } else fail++;
      } catch (_) { fail++; }
      await new Promise((r) => setTimeout(r, 150)); // 네이버에 몰아서 요청하지 않도록 조금 쉰다
    }
  }));
  send(200, { backend: store.backend, date: today, due: ids.length, saved: ok, failed: fail, remaining: Math.max(0, ids.length - i), ms: Date.now() - started });
};
