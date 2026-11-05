// 임시 확인용 (확인 후 삭제): 11월 메이트 발표 글에서 블로그 몇 개를 뽑아 메이트 여부 확인
module.exports = async function handler(req, res) {
  const t = await (await fetch('https://m.blog.naver.com/PostView.naver?blogId=blogpeople&logNo=224464503351', { headers: { Referer: 'https://m.blog.naver.com/blogpeople' } })).text();
  const ids = [...new Set([...t.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]{3,30})(?=["/?&\s<])/g)].map((m) => m[1]))]
    .filter((x) => !/^(blogpeople|PostView|PostList|prologue|profile|api|my|section|BlogHome)/i.test(x)).slice(0, 8);
  const out = { found: ids.length, checks: [] };
  for (const id of ids) {
    try { const r = (await (await fetch(`https://m.blog.naver.com/api/blogs/${id}`, { headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` } })).json()).result || {};
      out.checks.push({ id, mate: r.isNaverMateBlog, mateInfo: r.mateInfo, cit: r.mateCitations }); } catch (e) { out.checks.push({ id, error: e.message }); }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
