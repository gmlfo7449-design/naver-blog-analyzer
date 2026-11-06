// 화면이 로그인에 쓸 공개 설정. 공개 키(publishable)는 브라우저에 보여도 되는 키다. 비밀 키는 절대 내보내지 않는다.
const store = require('../lib/store');
const { PUB_KEY } = require('../lib/auth');
const { PLANS } = require('../lib/plans');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({
    authEnabled: !!(store.supabaseOn && PUB_KEY),
    supabaseUrl: store.supabaseOn ? store.SB_URL : '',
    publishableKey: PUB_KEY,
    plans: PLANS,
  }));
};
