// 내 정보와 내 블로그 관리 (로그인 필요)
//   GET  /api/me                                         → { user, plan, limits, blogs }
//   POST /api/me { action: 'add', blogId, role: 'me'|'competitor' }
//   POST /api/me { action: 'remove', blogId }
const { getUser } = require('../lib/auth');
const members = require('../lib/members');
const store = require('../lib/store');
const { ID_RE } = require('./rss');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) raw += c;
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (!store.supabaseOn) return send(503, { error: '회원 기능을 쓰려면 데이터베이스(Supabase)가 연결돼 있어야 해요.' });
  const user = await getUser(req);
  if (!user) return send(401, { error: '로그인이 필요해요.', code: 'login' });
  try {
    if (req.method === 'GET') return send(200, await members.summary(user));
    if (req.method !== 'POST') return send(405, { error: 'GET 또는 POST만 됩니다.' });
    const b = await readBody(req);
    const blogId = String(b.blogId || '').trim();
    if (!ID_RE.test(blogId)) return send(400, { error: '블로그 아이디 형식이 올바르지 않아요.' });
    if (b.action === 'add') return send(200, await members.addBlog(user, blogId, b.role === 'me' ? 'me' : 'competitor'));
    if (b.action === 'remove') return send(200, await members.removeBlog(user, blogId));
    return send(400, { error: '알 수 없는 요청이에요.' });
  } catch (e) {
    send(e.status || 500, { error: e.message || '저장하지 못했어요.', code: e.code });
  }
};
