// 블로그 하나의 홈판 노출 기록 (최근 7일). GET /api/homefeed?id=블로그아이디
const store = require('../lib/store');
const { ID_RE } = require('./rss');

const DAYS = 7;
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  const id = String((req.query || {}).id || '').trim().toLowerCase();
  if (!ID_RE.test(id)) return send(400, { error: '블로그 아이디가 올바르지 않아요.' });
  if (!store.supabaseOn) return send(200, { enabled: false });
  try {
    const now = Date.now();
    const fromDay = new Date(now + 9 * 36e5 - (DAYS - 1) * 864e5).toISOString().slice(0, 10);
    const fromTs = new Date(now - DAYS * 864e5).toISOString();
    const [first, runs, hits] = await Promise.all([
      store.sb('home_runs?select=ran_at&order=ran_at.asc&limit=1'),
      store.sb(`home_runs?select=ran_at&ran_at=gte.${fromTs}&limit=5000`),
      store.sb(`home_hits?select=log_no,day,tab,hits,last_seen&blog_id=eq.${encodeURIComponent(id)}&day=gte.${fromDay}&limit=2000`),
    ]);
    const logNos = [...new Set((hits || []).map((h) => h.log_no))];
    const posts = logNos.length ? await store.sb(`home_posts?select=log_no,title,thumbnail,created_at,first_seen,last_seen&log_no=in.(${logNos.join(',')})`) : [];
    const pm = new Map((posts || []).map((p) => [p.log_no, p]));
    const sum = (rows) => ({
      hits: rows.reduce((a, h) => a + h.hits, 0),
      days: new Set(rows.map((h) => h.day)).size,
      posts: new Set(rows.map((h) => h.log_no)).size,
    });
    const home = (hits || []).filter((h) => h.tab === 'home'), topic = (hits || []).filter((h) => h.tab !== 'home');
    const byPost = logNos.map((n) => {
      const hs = hits.filter((h) => h.log_no === n), p = pm.get(n) || {};
      return { logNo: n, title: p.title || '', thumbnail: p.thumbnail || null, created: p.created_at || null,
        homeHits: hs.filter((h) => h.tab === 'home').reduce((a, h) => a + h.hits, 0),
        topicHits: hs.filter((h) => h.tab !== 'home').reduce((a, h) => a + h.hits, 0),
        tabs: [...new Set(hs.map((h) => h.tab))], lastSeen: hs.reduce((a, h) => (h.last_seen > a ? h.last_seen : a), '') };
    }).sort((a, b) => (b.homeHits + b.topicHits) - (a.homeHits + a.topicHits));
    send(200, { enabled: true, since: first && first[0] ? first[0].ran_at : null, runs: (runs || []).length, days: DAYS,
      home: sum(home), topic: sum(topic), posts: byPost });
  } catch (e) {
    // 아직 SQL(003_homefeed.sql)을 실행하지 않아 표가 없을 때
    if (/PGRST205|42P01|does not exist|Could not find the table/i.test(String(e.message))) return send(200, { enabled: false, setup: true });
    send(500, { error: '홈판 기록을 불러오지 못했어요.', detail: String(e.message || e).slice(0, 200) });
  }
};
