// 네이버 로그인 (Supabase가 네이버를 기본 지원하지 않아서 서버가 대신 처리한다)
// 1) GET /api/auth-naver                → 네이버 로그인 화면으로 보냄 (위조 방지용 state를 쿠키에 저장)
// 2) GET /api/auth-naver?code=&state=   → 네이버가 돌려보냄: 토큰 교환 → 회원 정보(이메일) 확인
//    → Supabase에 같은 이메일 회원이 없으면 만들고 → 메일 없이 바로 로그인 세션을 만들어 → 화면으로 돌려보냄
// 필요한 설정: NAVER_LOGIN_CLIENT_ID, NAVER_LOGIN_CLIENT_SECRET (네이버 개발자센터 '네이버 로그인' 앱)
const crypto = require('crypto');
const { SB_URL, supabaseOn } = require('../lib/store');
const { PUB_KEY } = require('../lib/auth');

const CID = process.env.NAVER_LOGIN_CLIENT_ID || '';
const CSECRET = process.env.NAVER_LOGIN_CLIENT_SECRET || '';
const SB_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const enabled = () => !!(CID && CSECRET && supabaseOn && SB_SECRET);

const origin = (req) => `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const callbackUrl = (req) => `${origin(req)}/api/auth-naver`;
const cookie = (req, name) => ((req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '=')) || '').split('=')[1] || '';

// Supabase 관리 요청: 예전 service_role 키(eyJ...)는 Authorization에도, 새 비밀 키(sb_secret_)는 apikey로만
const adminHeaders = () => ({ apikey: SB_SECRET, 'Content-Type': 'application/json', ...(SB_SECRET.startsWith('eyJ') ? { Authorization: `Bearer ${SB_SECRET}` } : {}) });

function back(res, req, hash) {
  res.statusCode = 302;
  res.setHeader('Set-Cookie', 'nv_state=; Path=/api/auth-naver; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  res.setHeader('Location', `${origin(req)}/#${hash}`);
  res.end();
}
const fail = (res, req, msg) => back(res, req, 'login_error=' + encodeURIComponent(msg));

module.exports = async function handler(req, res) {
  const q = req.query || {};
  if (!enabled()) return fail(res, req, '네이버 로그인이 아직 설정되지 않았어요.');

  // 1) 시작
  if (!q.code && !q.error) {
    const state = crypto.randomBytes(16).toString('hex');
    res.statusCode = 302;
    res.setHeader('Set-Cookie', `nv_state=${state}; Path=/api/auth-naver; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    res.setHeader('Location', 'https://nid.naver.com/oauth2.0/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CID, redirect_uri: callbackUrl(req), state }));
    return res.end();
  }

  // 2) 돌아옴
  if (q.error) return fail(res, req, '네이버 로그인을 취소했거나 동의하지 않았어요.');
  if (!q.state || q.state !== cookie(req, 'nv_state')) return fail(res, req, '로그인 요청이 만료됐어요. 다시 시도해 주세요.');
  try {
    // 토큰 교환
    const tk = await (await fetch('https://nid.naver.com/oauth2.0/token?' + new URLSearchParams({ grant_type: 'authorization_code', client_id: CID, client_secret: CSECRET, code: q.code, state: q.state }), { signal: AbortSignal.timeout(8000) })).json();
    if (!tk.access_token) return fail(res, req, '네이버에서 로그인 정보를 받지 못했어요.');
    // 회원 정보
    const me = await (await fetch('https://openapi.naver.com/v1/nid/me', { headers: { Authorization: `Bearer ${tk.access_token}` }, signal: AbortSignal.timeout(8000) })).json();
    const p = me.response || {};
    if (!p.email) return fail(res, req, '네이버 로그인에서 이메일 제공에 동의해 주세요.');
    const email = String(p.email).toLowerCase();

    // Supabase 회원 만들기 (이미 있으면 그대로 씀)
    await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: adminHeaders(), signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { provider: 'naver', naver_id: p.id, name: p.name || p.nickname || '' } }),
    });
    // 메일을 보내지 않고 1회용 로그인 토큰을 만들어 바로 세션으로 바꾼다
    const gl = await (await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: 'POST', headers: adminHeaders(), signal: AbortSignal.timeout(8000), body: JSON.stringify({ type: 'magiclink', email }),
    })).json();
    const hashed = gl.hashed_token || (gl.properties && gl.properties.hashed_token);
    if (!hashed) return fail(res, req, '로그인 세션을 만들지 못했어요. (관리 키 확인 필요)');
    const sess = await (await fetch(`${SB_URL}/auth/v1/verify`, {
      method: 'POST', headers: { apikey: PUB_KEY || SB_SECRET, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
    })).json();
    if (!sess.access_token) return fail(res, req, '로그인 세션을 만들지 못했어요.');
    // 화면(supabase-js)이 주소의 # 뒤 값을 읽어 로그인한다
    return back(res, req, new URLSearchParams({ access_token: sess.access_token, refresh_token: sess.refresh_token, expires_in: String(sess.expires_in || 3600), token_type: 'bearer', type: 'naver' }).toString());
  } catch (e) {
    return fail(res, req, '네이버 로그인 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.');
  }
};
module.exports.enabled = enabled;
