// 매일 한 번 (Vercel Cron): 추적 중인 블로그마다 '오늘 자정 시점 누적 방문자 수'를 저장한다.
// 자정 시점 누적 = 지금 누적 방문자 - 오늘 방문자. 그래서 하루 중 언제 돌아도 같은 값이 나온다.
// 하루 방문자 = 다음날 자정 누적 - 그날 자정 누적.
const store = require('../lib/store');
const { fetchProfile } = require('../lib/naver-profile');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  // Vercel Cron은 CRON_SECRET이 설정돼 있으면 Authorization 헤더에 담아 보낸다
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(401, { error: 'unauthorized' });
  if (!store.enabled) return send(200, { skipped: '저장소가 연결되지 않았어요.' });
  const ids = (await store.tracked()).slice(0, 300);
  const today = store.kstDate();
  let ok = 0, fail = 0, i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const r = await fetchProfile(id);
        if (typeof r.totalVisitorCount === 'number' && typeof r.dayVisitorCount === 'number') {
          await store.saveTotal(id, today, r.totalVisitorCount - r.dayVisitorCount); ok++;
        } else fail++;
      } catch (_) { fail++; }
    }
  }));
  send(200, { date: today, tracked: ids.length, saved: ok, failed: fail });
};
