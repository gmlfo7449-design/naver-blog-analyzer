// 제목 노출 확인: 최근 글 제목으로 네이버 블로그 검색(NAVER API HUB)을 해서 그 글이 몇 위에 나오는지 본다.
// - 키: Vercel 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (NAVER API HUB > Application > 인증 정보)
// - 검색 API 결과 기준이며, 실제 블로그탭 화면 순위와 다를 수 있다.
const { getBlog, ID_RE } = require('./rss');

const API = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const MAX_POSTS = 30;      // 최근 글 몇 개를 볼지 (글 1개 = API 1회)
const DISPLAY = 30;        // 검색 결과 상위 몇 개까지 볼지 (30위 안 = 노출)
const SKIP_HOURS = 1;      // 발행 1시간 이내 글은 검색하지 않고 '미반영'
const PENDING_HOURS = 1;   // 발행 1시간이 지났는데 검색에 없으면 '누락'
const CONCURRENCY = 3;
const BATCH_MAX = 10;      // 한 번 요청에 확인할 최대 글 수 (함수 시간 제한을 넘지 않게)
const cache = new Map();
const TTL_MS = 60 * 60 * 1000;
const VERSION = 7; // 판정 방식이 바뀌면 올려서 CDN 캐시를 무효화

const logNoOf = (url) => (String(url).match(/\/(\d{9,})(?:[/?#]|$)/) || [])[1] || (String(url).match(/logNo=(\d+)/) || [])[1] || '';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 일시적 오류(429·5xx·네트워크)는 최대 3번까지 간격을 늘려 다시 시도한다
async function callApi(url, headers) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) { last = e; }
    await wait(400 * 2 ** i);
  }
  if (last && last.status) return last;
  throw Object.assign(new Error('검색 API에 연결하지 못했어요.'), { status: 502 });
}

async function searchRank(title, blogId, logNo, sort = 'sim', display = DISPLAY) {
  const q = new URLSearchParams({ query: title, display: String(display), start: '1', sort });
  const res = await callApi(`${API}?${q}`, { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('검색 API 인증에 실패했어요. Vercel 환경변수의 키 값을 확인해 주세요.'), { status: 502, fatal: true });
  if (res.status === 429) return { rank: null, error: '호출 한도 초과' };
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
  const key = id + ':' + VERSION;
  // 예전 화면(한 번에 전부 요청)은 offset 없이 부른다 → 새로고침 안내
  if (req.query.offset === undefined) {
    return send(409, { error: '사이트가 업데이트됐어요. 새로고침(Ctrl+F5, Mac은 ⌘+Shift+R)하면 30개 모두 확인돼요.', code: 'outdated' });
  }
  const offset = Math.max(0, Math.min(MAX_POSTS - 1, parseInt(req.query.offset, 10) || 0));
  const limit = Math.max(1, Math.min(BATCH_MAX, parseInt(req.query.limit, 10) || BATCH_MAX, MAX_POSTS - offset));
  const hit = cache.get(key + ':' + offset + ':' + limit);
  if (hit && Date.now() - hit.at < TTL_MS) return send(200, hit.data);
  try {
    const blog = await getBlog(id);
    const all = [...blog.items].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, MAX_POSTS);
    const posts = all.slice(offset, offset + limit);
    const results = await pool(posts, CONCURRENCY, async (p) => {
      const logNo = logNoOf(p.link);
      const ageH = (Date.now() - new Date(p.pubDate).getTime()) / 36e5;
      if (ageH < SKIP_HOURS) return { logNo, title: p.title, pubDate: p.pubDate, status: 'pending', rank: null, skipped: true };
      // 제목을 큰따옴표로 감싸 '정확히 일치' 검색을 한다 (안쪽 큰따옴표는 지움)
      const exact = '"' + p.title.replace(/["“”]/g, ' ').replace(/\s+/g, ' ').trim() + '"';
      let r = await searchRank(exact, id, logNo);
      // 정확도순 30위 안에 없으면, 같은 검색어로 최신순 100개에서 한 번 더 찾는다 → 있으면 '검색엔 있지만 30위 밖'
      let indexed = !!r.rank;
      if (!r.rank && !r.error) { const d = await searchRank(exact, id, logNo, 'date', 100); indexed = !!d.rank; r.dateRank = d.rank; }
      r.indexed = indexed;
      const status = r.error ? 'error' : r.indexed ? 'shown' : ageH < PENDING_HOURS ? 'pending' : 'missing';
      return { logNo, title: p.title, pubDate: p.pubDate, status, ...r };
    });
    const data = { version: VERSION, blogId: id, checkedAt: new Date().toISOString(), display: DISPLAY, pendingHours: PENDING_HOURS, skipHours: SKIP_HOURS,
      offset, limit, total: all.length, results };
    // 확인 실패가 섞인 결과는 캐시하지 않는다 (다시 확인하면 새로 검색)
    if (!results.some((x) => x.error)) cache.set(key + ':' + offset + ':' + limit, { at: Date.now(), data });
    res.setHeader('Cache-Control', results.some((x) => x.error) ? 'no-store' : 's-maxage=3600, stale-while-revalidate=21600');
    send(200, data);
  } catch (e) {
    send(e.status || 500, { error: e.message || '알 수 없는 오류' });
  }
};
module.exports.logNoOf = logNoOf;
