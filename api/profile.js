// 블로그 프로필·글별 반응 (비공식)
// 네이버 모바일 블로그 화면이 쓰는 내부 주소에서 이웃 수, 방문자 수, 글별 공감·댓글 수를 가져온다.
// 공식 API가 아니므로 네이버가 막거나 형식을 바꾸면 언제든 실패할 수 있다. 실패하면 화면은 이 값들 없이 동작한다.
const { ID_RE, getBlog } = require('./rss');
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

// 인플루언서 확인 (두 단계, 비공식)
// 1) in.naver.com/{블로그ID}가 열리고 그 홈이 '이 블로그'를 연결하면 확인됨
// 2) 아니면 이 블로그의 최근 글 제목으로 네이버 블로그 탭을 검색해, 그 글의 작성자 링크가 in.naver.com/○○이면 확인됨
//    (검색 결과에서 인플루언서 글은 작성자 링크가 블로그 대신 인플루언서 홈으로 걸린다. 홈 ID가 블로그 ID와 달라도 찾을 수 있다)
// 둘 다 아니면 '아님'으로 단정하지 않는다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
async function homeLinksBlog(handle, id) {
  try {
    const r = await fetch(`https://in.naver.com/${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (r.status !== 200) return false;
    const html = await r.text();
    return new Set([...html.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].map((m) => m[1].toLowerCase())).has(id.toLowerCase());
  } catch (_) { return false; }
}
async function influencerFromSearch(id, title) {
  if (!title) return null;
  try {
    // 따옴표로 감싼 정확히 일치 검색은 제목 속 “ ” ‘ ’ · 때문에 결과가 0건이 되기도 해서, 문장부호를 빼고 그냥 검색한다
    const q = title.replace(/["'“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await fetch('https://search.naver.com/search.naver?ssc=tab.blog.all&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const html = await r.text();
    const re = new RegExp(`blog\\.naver\\.com\\/${id.replace(/[-]/g, '\\-')}(?=[\\/"?])`, 'gi');
    for (const m of html.matchAll(re)) {
      // 이 글 링크 바로 앞 작성자 영역에서 인플루언서 홈 링크를 찾는다. 사이에 다른 블로그 링크가 끼면 다른 글이므로 버린다
      const before = html.slice(Math.max(0, m.index - 6000), m.index);
      const homes = [...before.matchAll(/href="https:\/\/in\.naver\.com\/([\w.-]{2,40})"/g)];
      if (!homes.length) continue;
      const last = homes[homes.length - 1];
      const between = before.slice(last.index);
      const others = [...between.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].filter((x) => x[1].toLowerCase() !== id.toLowerCase());
      if (!others.length) return `https://in.naver.com/${last[1]}`;
    }
    return null;
  } catch (_) { return null; }
}
async function influencerHome(id, titles = []) {
  if (await homeLinksBlog(id, id)) return { url: `https://in.naver.com/${id}`, via: 'home' };
  // 방금 쓴 글은 아직 검색에 없을 수 있어 며칠 지난 글부터 최대 3개 시도
  for (const t of titles.slice(0, 3)) { const s = await influencerFromSearch(id, t); if (s) return { url: s, via: 'search' }; }
  return null;
}

async function load(id) {
  const [info, list, pop, infl] = await Promise.allSettled([
    getJson(`${BASE}${id}`, id),
    getJson(`${BASE}${id}/post-list?categoryNo=0&itemCount=30&page=1`, id),
    getJson(`${BASE}${id}/popular-post-list`, id),
    getBlog(id).then((bl) => { const it = [...(bl.items || [])].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)); return influencerHome(id, [it[5], it[10], it[2]].filter(Boolean).map((x) => x.title)); }).catch(() => influencerHome(id, [])),
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
      influencerHome: infl.status === 'fulfilled' && infl.value ? infl.value.url : null,
      influencerVia: infl.status === 'fulfilled' && infl.value ? infl.value.via : null,
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
    // 분석 기록 저장 (저장소가 연결된 경우만). 매일 기록 '등록'은 화면에서 따로 한다.
    // 분석할 때 이미 받은 값으로 오늘 자정 시점 누적(지금 누적 - 오늘 방문자)도 함께 남겨, 네이버에 추가 요청 없이 기록을 쌓는다.
    if (data.profile && store.enabled) {
      try {
        const p = data.profile, today = store.kstDate();
        await store.touchBlog(id, { blog_name: p.blogName, nickname: p.nickName, topic: p.topic });
        if (p.totalVisitors != null && p.todayVisitors != null) await store.saveTotal(id, today, p.totalVisitors - p.todayVisitors);
        const avg = (k) => { const v = data.posts.map((x) => x[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, c) => a + c, 0) / v.length * 10) / 10 : null; };
        const pop = data.popular.map((x) => x.views).filter((x) => x != null);
        await store.saveSnapshot(id, today, {
          neighbors: p.neighbors, total_visitors: p.totalVisitors, today_visitors: p.todayVisitors,
          popular_sum: pop.length ? pop.reduce((a, c) => a + c, 0) : null, avg_likes: avg('likes'), avg_comments: avg('comments'),
          naver_mate: p.naverMate, mate_topic: p.mate ? p.mate.topic : null,
          citations_month: p.citations ? p.citations.thisMonth : null, influencer_home: p.influencerHome,
        });
        data.stored = store.backend;
      } catch (e) { data.storeError = e.message; /* 저장 실패는 분석에 영향 주지 않음 */ }
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    send(200, data);
  } catch (e) {
    send(500, { error: e.message || '알 수 없는 오류' });
  }
};
