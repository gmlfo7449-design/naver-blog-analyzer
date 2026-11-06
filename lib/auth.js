// 로그인 확인: 브라우저가 보낸 Supabase 로그인 토큰을 Supabase에 물어봐서 누구인지 확인한다.
const { SB_URL, supabaseOn } = require('./store');
const PUB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

async function getUser(req) {
  if (!supabaseOn) return null;
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: PUB_KEY || SECRET, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const u = await res.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (_) { return null; }
}
module.exports = { getUser, PUB_KEY };
