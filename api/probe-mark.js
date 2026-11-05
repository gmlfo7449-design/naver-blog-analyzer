// 임시 확인용 (확인 후 삭제): 네이버 블로그 탭 검색 결과에 인플루언서 표시가 있는지 확인
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
module.exports = async function handler(req, res) {
  const tests = [['pso164', '과학커뮤니케이터 박종현'], ['notsilly', '코코넛 블로그'], ['titan742', '작은거인 블로그']];
  const out = [];
  for (const [id, q] of tests) {
    try {
      const r = await fetch('https://search.naver.com/search.naver?ssc=tab.blog.all&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' }, signal: AbortSignal.timeout(8000) });
      const html = await r.text();
      const i = html.indexOf(`blog.naver.com/${id}`);
      const near = i >= 0 ? html.slice(Math.max(0, i - 1500), i + 600) : '';
      out.push({ id, status: r.status, len: html.length, foundBlog: i >= 0,
        nearHits: [...near.matchAll(/.{0,80}(?:in\.naver\.com|[Ii]nfluencer|인플루언서|ico_|badge|verified|인증).{0,80}/g)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 8),
        pageHasInfluencer: /인플루언서|in\.naver\.com/.test(html), captcha: /captcha|자동입력/i.test(html) });
    } catch (e) { out.push({ id, error: e.message }); }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
