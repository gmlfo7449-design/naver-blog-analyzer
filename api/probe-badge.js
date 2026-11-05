// 임시 확인용 (확인 후 삭제): 블로그·프로필 페이지에서 인플루언서 흔적 찾기
module.exports = async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^\w-]/g, '');
  const pages = [`https://blog.naver.com/profile/intro.naver?blogId=${id}`, `https://blog.naver.com/PostList.naver?blogId=${id}`, `https://m.blog.naver.com/${id}`, `https://blog.naver.com/${id}`];
  const out = [];
  for (const u of pages) {
    try {
      const t = await (await fetch(u, { headers: { Referer: 'https://blog.naver.com/' }, signal: AbortSignal.timeout(8000) })).text();
      const hits = [...t.matchAll(/.{0,80}(?:in\.naver\.com|[Ii]nfluencer|인플루언서).{0,80}/g)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 8);
      out.push({ u, len: t.length, hits });
    } catch (e) { out.push({ u, error: e.message }); }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
