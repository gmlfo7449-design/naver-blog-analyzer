// 블로그 프로필·글별 반응 (비공식)
// 네이버 모바일 블로그 화면이 쓰는 내부 주소에서 이웃 수, 방문자 수, 글별 공감·댓글 수를 가져온다.
// 공식 API가 아니므로 네이버가 막거나 형식을 바꾸면 언제든 실패할 수 있다. 실패하면 화면은 이 값들 없이 동작한다.
const { ID_RE } = require('./rss');
const store = require('../lib/store');

const BASE = 'https://m.blog.naver.com/api/blogs/';
const cache = new Map();
const TTL_MS = 30 * 60 * 1000;

async function getJson(url, blogId) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${blogId}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error(`네이버 응답 ${res.status}`), { status: res.status });
  const body = await res.json();
  if (!body || body.isSuccess === false) throw new Error('네이버가 빈 응답을 보냈어요.');
  return body.result || {};
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 인플루언서 확인: in.naver.com/{블로그ID}가 열리고, 그 인플루언서 홈이 '이 블로그'를 연결하고 있을 때만 확인됨으로 본다.
// - 같은 이름의 다른 블로그를 인플루언서로 잘못 보지 않게 홈에 연결된 블로그를 꼭 확인한다 (예: 홈 coconut38 → 블로그 notsilly).
// - 인플루언서 홈 ID가 블로그 ID와 다르면 찾을 수 없으므로, 확인되지 않았다고 '아님'으로 단정하지 않는다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
async function influencerHome(id) {
  try {
    const r = await fetch(`https://in.naver.com/${encodeURIComponent(id)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (r.status !== 200) return null;
    const html = await r.text();
    const linked = new Set([...html.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].map((m) => m[1].toLowerCase()));
    return linked.has(id.toLowerCase()) ? `https://in.naver.com/${id}` : null;
  } catch (_) { return null; }
}

async function load(id) {
  const [info, list, pop, infl] = await Promise.allSettled([
    getJson(`${BASE}${id}`, id),
    getJson(`${BASE}${id}/post-list?categoryNo=0&itemCount=30&page=1`, id),
    getJson(`${BASE}${id}/popular-post-list`, id),
    influencerHome(id),
  ]);
  const out = { blogId: id, fetchedAt: new Date().toISOString(), profile: null, posts: [], popular: [], errors: [] };
  if (info.status === 'fulfilled') {
    const r = info.value;
    out.profile = {
      nickName: r.nickName || '',
      blogName: r.blogName || '',
      neighbors: num(r.subscriberCount),
      totalVisitors: num(r.totalVisitorCount),
      todayVisitors: num(r.dayVisitorCount),
      officialBlog: !!r.officialBlog,
      powerBlog: !!r.powerBlog,
      naverMate: !!r.isNaverMateBlog,
      // 메이트 선정 정보 (선정된 블로그만): 주제, 선정 연월
      mate: r.isNaverMateBlog && r.mateInfo ? { topic: r.mateInfo.topic || '', year: num(r.mateInfo.year), month: num(r.mateInfo.month) } : null,
      // AI 브리핑 인용 수 (메이트 선정에 쓰이는 지표). 값이 없는 블로그도 많다
      citations: r.mateCitations ? { thisMonth: num(r.mateCitations.currentMonthCount), month: num(r.mateCitations.currentMonth),
        cumulative: num(r.mateCitations.cumulativeCount), period: num(r.mateCitations.selectionPeriodCount), periodMonth: num(r.mateCitations.selectionPeriodMonth) } : null,
      topic: r.blogDirectoryName || '',
      influencerHome: infl.status === 'fulfilled' ? infl.value : null,
      coverImage: (r.mobileTitleImage && (r.mobileTitleImage.croppedImage || r.mobileTitleImage.originalImage)) || '',
      profileImage: r.profileImagePath || '',
    };
  } else out.errors.push('profile');
  if (list.status === 'fulfilled') {
    out.posts = (list.value.items || []).map((p) => ({
      logNo: String(p.logNo || ''),
      comments: num(p.commentCnt),
      likes: num(p.sympathyCnt),
      images: num(p.thumbnailCount),
      shares: num(p.shareCnt),
    })).filter((p) => p.logNo);
  } else out.errors.push('posts');
  // 네이버가 고른 인기글 (최대 10개) — 조회수는 이 글들에만 공개된다
  if (pop.status === 'fulfilled') {
    const thumb = (p) => { const t = (p.thumbnailList || [])[0]; const u = t && (t.encodedThumbnailUrl || t.url || t.thumbnailUrl || ''); return u ? String(u).replace(/^http:/, 'https:') : ''; };
    out.popular = (pop.value.popularPostList || []).map((p) => ({
      logNo: String(p.logNo || ''), title: p.titleWithInspectMessage || '', views: num(p.viewCount),
      likes: num(p.sympathyCnt), comments: num(p.commentCnt), date: p.addDate ? new Date(p.addDate).toISOString() : null,
      category: p.categoryName || '', thumbnail: thumb(p),
    })).filter((p) => p.logNo);
  } else out.errors.push('popular');
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  const id = String((req.query && req.query.id) || '').trim();
  if (!ID_RE.test(id)) return send(400, { error: '블로그 ID 형식이 올바르지 않습니다.' });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return send(200, hit.data);
  try {
    const data = await load(id);
    if (!data.profile && !data.posts.length) return send(502, { error: '네이버에서 블로그 정보를 가져오지 못했어요.', errors: data.errors });
    cache.set(id, { at: Date.now(), data });
    // 분석한 블로그는 매일 누적 방문자 수를 저장할 목록에 넣는다 (저장소가 연결된 경우만)
    if (data.profile && store.enabled) {
      try {
        await store.track(id);
        const today = store.kstDate();
        const saved = await store.totals(id);
        // 처음 보는 블로그는 오늘 자정 시점 누적값(지금 누적 - 오늘 방문자)을 바로 기록해 둔다
        if (saved[today] == null && data.profile.totalVisitors != null && data.profile.todayVisitors != null) {
          await store.saveTotal(id, today, data.profile.totalVisitors - data.profile.todayVisitors);
        }
      } catch (_) { /* 저장 실패는 분석에 영향 주지 않음 */ }
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    send(200, data);
  } catch (e) {
    send(500, { error: e.message || '알 수 없는 오류' });
  }
};
