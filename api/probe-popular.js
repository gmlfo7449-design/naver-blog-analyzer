// 임시 확인용 (확인 후 삭제): 인기글 조회수를 주는 주소 후보를 시험한다
module.exports = async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^\w-]/g, '');
  const urls = [
    `https://m.blog.naver.com/api/blogs/${id}/popular-post-list`,
    `https://m.blog.naver.com/api/blogs/${id}/popular-posts`,
    `https://m.blog.naver.com/api/blogs/${id}/post-list/popular`,
  ];
  const out = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` }, signal: AbortSignal.timeout(6000) });
      out.push({ u, status: r.status, body: (await r.text()).slice(0, 700) });
    } catch (e) { out.push({ u, error: e.message }); }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
