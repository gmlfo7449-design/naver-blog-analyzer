// 일별 방문자 수 (비공식): 블로그 방문자 위젯이 쓰는 주소에서 최근 며칠 값을 가져온다.
// 블로그 주인이 방문자 수를 비공개로 두었거나 네이버가 막으면 빈 결과가 온다.
const { ID_RE } = require('./rss');
const store = require('../lib/store');

const cache = new Map();
const TTL_MS = 30 * 60 * 1000;

async function fetchDaily(id) {
  const res = await fetch(`https://blog.naver.com/NVisitorgp4Ajax.naver?blogId=${encodeURIComponent(id)}`, {
    headers: { Referer: `https://blog.naver.com/${id}` },
    signal: AbortSignal.timeout(8000),
  });
  const text = res.status === 204 ? '' : await res.text();
  const days = [...text.matchAll(/<visitorcnt\s+id="(\d{8})"\s+cnt="(\d+)"/g)]
    .map((m) => ({ date: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`, count: Number(m[2]) }));
  return { status: res.status, days, sample: days.length ? '' : text.slice(0, 200) };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  const id = String((req.query && req.query.id) || '').trim();
  if (!ID_RE.test(id)) return send(400, { error: '블로그 ID 형식이 올바르지 않습니다.' });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return send(200, hit.data);
  try {
    const r = await fetchDaily(id).catch(() => ({ status: 0, days: [] }));
    // 저장해 둔 '자정 시점 누적'에서 하루 방문자 계산: 그날 = 다음날 자정 누적 - 그날 자정 누적
    const history = [];
    if (store.enabled) {
      const t = await store.totals(id);
      const dates = Object.keys(t).sort();
      for (let k = 0; k + 1 < dates.length; k++) {
        const d0 = new Date(dates[k] + 'T00:00:00Z'), d1 = new Date(dates[k + 1] + 'T00:00:00Z');
        if ((d1 - d0) / 864e5 === 1) history.push({ date: dates[k], count: t[dates[k + 1]] - t[dates[k]] });
      }
    }
    // 위젯 값(최근 5일)을 우선하고, 없는 날은 저장 기록으로 채운다
    const byDate = new Map(history.map((d) => [d.date, { ...d, source: 'history' }]));
    r.days.forEach((d) => byDate.set(d.date, { ...d, source: 'widget' }));
    const today = store.kstDate();
    const days = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date)).map((d) => ({ ...d, partial: d.date === today }));
    const data = { blogId: id, fetchedAt: new Date().toISOString(), widget: r.days.length > 0, storage: store.enabled, days };
    if (days.length) { cache.set(id, { at: Date.now(), data }); res.setHeader('Cache-Control', 's-maxage=1800'); }
    send(200, data);
  } catch (e) {
    send(502, { error: '네이버에서 방문자 수를 가져오지 못했어요.', detail: e.message });
  }
};
