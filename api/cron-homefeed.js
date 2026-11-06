// 홈판 수집 (GitHub Actions가 10분마다 부른다). CRON_SECRET이 있어야 실행된다.
const store = require('../lib/store');
const { collect } = require('../lib/homefeed');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(401, { error: 'unauthorized' });
  if (!store.supabaseOn) return send(200, { skipped: 'Supabase가 연결되지 않았어요.' });
  try {
    const r = await collect({ homePages: 12, topicPages: 2, deadline: Date.now() + 45000 });
    if (r.rows.length) await store.sb('rpc/home_hit', { method: 'POST', body: { p: r.rows } });
    await store.sb('home_runs', { method: 'POST', body: [{ pages: r.pages, cards: r.cards, blog_posts: r.rows.length, errors: r.errors }], prefer: 'return=minimal' });
    send(200, { ok: true, pages: r.pages, cards: r.cards, blogPosts: r.rows.length, home: r.rows.filter((x) => x.tab === 'home').length, errors: r.errors });
  } catch (e) {
    send(500, { error: String(e.message || e).slice(0, 300) });
  }
};
