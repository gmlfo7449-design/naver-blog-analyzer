// 임시 확인용 (확인 후 삭제)
module.exports = async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^\w-]/g, '');
  const r = await fetch(`https://m.blog.naver.com/api/blogs/${id}/popular-post-list`, { headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` } });
  const j = await r.json(); const list = (j.result && j.result.popularPostList) || [];
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ keys: list[0] ? Object.keys(list[0]) : [], resultKeys: Object.keys(j.result || {}),
    items: list.map((p) => ({ logNo: p.logNo, title: (p.titleWithInspectMessage || '').slice(0, 30), readCount: p.readCount, viewCount: p.viewCount, addDate: p.addDate, sympathyCnt: p.sympathyCnt, commentCnt: p.commentCnt })) }));
};
