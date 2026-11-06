// 매일 기록 등록 관리
//   GET  /api/watch?id=블로그ID                     → { registered, backend }
//   POST /api/watch  { id, action: 'register'|'unregister', role }
//   POST /api/watch  { id, action: 'expo', shown, pending, missing, total }  → 오늘 분석 기록에 제목 노출 결과 저장
const store = require('../lib/store');
const { ID_RE } = require('./rss');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) raw += c;
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}
const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000, Math.round(Number(v)))) : null);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (!store.enabled) return send(200, { registered: false, backend: 'none' });
  try {
    if (req.method === 'GET') {
      const id = String((req.query && req.query.id) || '').trim();
      if (!ID_RE.test(id)) return send(400, { error: '블로그 ID 형식이 올바르지 않습니다.' });
      return send(200, { registered: await store.isRegistered(id), backend: store.backend });
    }
    if (req.method !== 'POST') return send(405, { error: 'GET 또는 POST만 됩니다.' });
    const b = await readBody(req);
    const id = String(b.id || '').trim();
    if (!ID_RE.test(id)) return send(400, { error: '블로그 ID 형식이 올바르지 않습니다.' });
    if (b.action === 'register') { await store.register(id, ['me', 'c1', 'c2'].includes(b.role) ? b.role : null); return send(200, { registered: true, backend: store.backend }); }
    if (b.action === 'unregister') { await store.unregister(id); return send(200, { registered: false, backend: store.backend }); }
    if (b.action === 'expo') {
      await store.saveSnapshot(id, store.kstDate(), { expo_shown: int(b.shown), expo_pending: int(b.pending), expo_missing: int(b.missing), expo_total: int(b.total) });
      return send(200, { ok: true });
    }
    return send(400, { error: '알 수 없는 요청이에요.' });
  } catch (e) {
    send(500, { error: e.message || '저장소 오류' });
  }
};
