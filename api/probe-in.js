// 임시 확인용 (확인 후 삭제): 실제 인플루언서 홈 ID로 판별법 검증
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
module.exports = async function handler(req, res) {
  const hs = String(req.query.h || '').split(',').filter((x) => /^[\w.-]{2,30}$/.test(x)).slice(0, 10);
  const out = await Promise.all(hs.map(async (h) => {
    const r = {};
    try {
      const a = await fetch(`https://in.naver.com/${h}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      const t = a.status === 200 ? await a.text() : '';
      r.inStatus = a.status;
      r.blogLinks = [...new Set([...t.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].map((m) => m[1]))].filter((x) => !/^(PostView|PostList|profile|prologue)$/.test(x)).slice(0, 3);
      r.apiPaths = [...new Set([...t.matchAll(/["'](\/[a-z]*api[^"'\s]{0,80}|https:\/\/[a-z.]*api[^"'\s]{0,80})["']/gi)].map((m) => m[1]))].slice(0, 6);
    } catch (e) { r.inErr = e.message; }
    try {
      const b = await fetch(`https://m.blog.naver.com/api/blogs/${h}`, { headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${h}` }, signal: AbortSignal.timeout(8000) });
      const j = b.ok ? await b.json() : null; r.sameIdBlog = !!(j && j.result && j.result.blogName); r.blogName = j && j.result ? j.result.blogName : null;
    } catch (e) { r.blogErr = e.message; }
    return { h, ...r };
  }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
