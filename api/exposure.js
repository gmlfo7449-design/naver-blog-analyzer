// 제목 노출 확인: 최근 글 제목으로 네이버 블로그 검색(NAVER API HUB)을 해서 그 글이 몇 위에 나오는지 본다.
// - 키: Vercel 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (NAVER API HUB > Application > 인증 정보)
// - 검색 API 결과 기준이며, 실제 블로그탭 화면 순위와 다를 수 있다.
const { getBlog, ID_RE } = require('./rss');

const API = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const MAX_POSTS = 30;      // 최근 글 몇 개를 볼지 (글 1개 = API 1회)
const DISPLAY = 30;        // 검색 결과 상위 몇 개까지 볼지 (30위 안 = 노출)
const PENDING_HOURS = 48;  // 발행 후 이 시간 안이면 '미반영'으로 본다
const CONCURRENCY = 5;
const cache = new Map();
const TTL_MS = 60 * 60 * 1000;
const VERSION = 3; // 판정 방식이 바뀌면 올려서 CDN 캐시를 무효화

const logNoOf = (url) => (String(url).match(/\/(\d{9,})(?:[/?#]|$)/) || [])[1] || (String(url).match(/logNo=(\d+)/) || [])[1] || '';

async function searchRank(title, blogId, logNo, sort = 'sim', display = DISPLAY) {
  const q = new URLSearchParams({ query: title, display: String(display), start: '1', sort });
  const res = await fetch(`${API}?${q}`, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET },
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('검색 API 인증에 실패했어요. Vercel 환경변수의 키 값을 확인해 주세요.'), { status: 502, fatal: true });
  if (res.status === 429) throw Object.assign(new Error('검색 API 호출 한도를 넘었어요. 잠시 뒤 다시 시도해 주세요.'), { status: 429, fatal: true });
  if (!res.ok) return { rank: null, error: `API 오류 ${res.status}` };
  const body = await res.json();
  const items = body.items || [];
  const idx = items.findIndex((it) => logNoOf(it.link) === logNo && String(it.link).includes(blogId));
  return { rank: idx >= 0 ? idx + 1 : null, total: body.total ?? null };
}

async function pool(list, n, fn) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
  }));
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = String((req.query && req.query.id) || '').trim();
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (!ID_RE.test(id)) return send(400, { error: '블로그 ID 형식이 올바르지 않습니다.' });
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return send(503, { error: '검색 API 키가 아직 설정되지 않았어요.', code: 'no_key' });
  }
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return send(200, hit.data);
  try {
    const blog = await getBlog(id);
    const posts = [...blog.items].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, MAX_POSTS);
    const results = await pool(posts, CONCURRENCY, async (p) => {
      const logNo = logNoOf(p.link);
      let r = await searchRank(p.title, id, logNo);
      // 정확도순 30위 안에 없으면, 최신순 100개에서 한 번 더 찾는다 → 있으면 '검색엔 있지만 30위 밖'
      let indexed = !!r.rank;
      if (!r.rank && !r.error) {
        const clean = p.title.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        const d = await searchRank(clean || p.title, id, logNo, 'date', 100); indexed = !!d.rank; r.dateRank = d.rank;
      }
      r.indexed = indexed;
      const ageH = (Date.now() - new Date(p.pubDate).getTime()) / 36e5;
      const status = r.error ? 'error' : r.indexed ? 'shown' : ageH < PENDING_HOURS ? 'pending' : 'missing';
      return { logNo, title: p.title, pubDate: p.pubDate, status, ...r };
    });
    const data = { blogId: id, checkedAt: new Date().toISOString(), display: DISPLAY, pendingHours: PENDING_HOURS, results };
    cache.set(id, { at: Date.now(), data });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
    send(200, data);
  } catch (e) {
    send(e.status || 500, { error: e.message || '알 수 없는 오류' });
  }
};
module.exports.logNoOf = logNoOf;
