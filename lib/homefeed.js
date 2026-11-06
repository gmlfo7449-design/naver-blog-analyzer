// 네이버 모바일 메인(m.naver.com) 홈판에 뜬 블로그 글을 모은다 (비공식).
// 로그인하지 않은 사람에게 보이는 기본 피드(popular-feeds)를 페이지별로 불러와,
// 카드 안에서 blog.naver.com/{아이디}/{글번호} 주소와 제목을 꺼낸다.
// tab: 'home' = 메인 홈판, 그 밖에는 주제판(경제·리빙푸드 등) 이름.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const TOPICS = ['mainEconomy', 'mainLivingFood', 'mainTravelCafe', 'mainFashionBeauty', 'mainHealth', 'mainKnowledge', 'mainCarTech', 'mainGame'];
const POST_RE = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([\w-]{3,40})\/(\d{9,})/;

function extract(json) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const m = typeof o.url === 'string' && o.url.match(POST_RE);
    if (m && typeof o.title === 'string') {
      out.push({ blog_id: m[1].toLowerCase(), log_no: m[2], title: o.title.slice(0, 300), thumbnail: typeof o.thumbnail === 'string' ? o.thumbnail.slice(0, 500) : null,
        created_at: typeof o.created === 'number' ? new Date(o.created * 1000).toISOString() : null });
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return out;
}

async function page(service, n, cursor, sessionId) {
  const url = `https://m.naver.com/nvhaproxy_craft/v1/homefeed/${service}/1/popular-feeds/page/${n}?sessionId=${sessionId}&page=${n}&pullToRefresh=0&nextCursor=${cursor}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://m.naver.com/', 'Accept-Language': 'ko-KR' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('홈피드 응답 ' + r.status);
  const j = await r.json();
  return { posts: extract(j.cards || []), cards: (j.cards || []).length, next: j.pageInfo && j.pageInfo.hasNext ? j.pageInfo.nextCursor : null };
}

// 한 번 수집: 메인 홈판 homePages쪽 + 주제판마다 topicPages쪽. 같은 탭 안의 중복 글은 한 번만 센다.
async function collect({ homePages = 8, topicPages = 2, delay = 250, deadline = Date.now() + 45000 } = {}) {
  const sessionId = 'bl' + Math.random().toString(36).slice(2, 14);
  const seen = new Map(); // `${tab}:${log_no}` → row
  const stat = { pages: 0, cards: 0, errors: 0 };
  const run = async (service, tab, max) => {
    let cursor = 0;
    for (let n = 1; n <= max && cursor != null && Date.now() < deadline; n++) {
      try {
        const p = await page(service, n, cursor, sessionId);
        stat.pages++; stat.cards += p.cards; cursor = p.next;
        p.posts.forEach((x) => { const k = tab + ':' + x.log_no; if (!seen.has(k)) seen.set(k, { ...x, tab }); });
      } catch (_) { stat.errors++; break; }
      await new Promise((r) => setTimeout(r, delay));
    }
  };
  await run('mainHomefeed', 'home', homePages);
  for (const t of TOPICS) await run(t, t, topicPages);
  return { rows: [...seen.values()], ...stat };
}

module.exports = { collect, extract, TOPICS };
