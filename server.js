// 로컬 실행용 서버 (의존성 없음): node server.js → http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const rss = require('./api/rss');
const exposure = require('./api/exposure');
const profile = require('./api/profile');
const visitors = require('./api/visitors');
const watch = require('./api/watch');
const me = require('./api/me');
const config = require('./api/config');
const authNaver = require('./api/auth-naver');
const homefeed = require('./api/homefeed');
const cronHomefeed = require('./api/cron-homefeed');

const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/rss') {
    req.query = Object.fromEntries(url.searchParams);
    return rss(req, res);
  }
  if (url.pathname === '/api/me') { req.query = Object.fromEntries(url.searchParams); return me(req, res); }
  if (url.pathname === '/api/auth-naver') { req.query = Object.fromEntries(url.searchParams); return authNaver(req, res); }
  if (url.pathname === '/api/homefeed') { req.query = Object.fromEntries(url.searchParams); return homefeed(req, res); }
  if (url.pathname === '/api/cron-homefeed') { req.query = Object.fromEntries(url.searchParams); return cronHomefeed(req, res); }
  if (url.pathname === '/api/config') { req.query = Object.fromEntries(url.searchParams); return config(req, res); }
  if (url.pathname === '/api/watch') {
    req.query = Object.fromEntries(url.searchParams);
    return watch(req, res);
  }
  if (url.pathname === '/api/visitors') {
    req.query = Object.fromEntries(url.searchParams);
    return visitors(req, res);
  }
  if (url.pathname === '/api/profile') {
    req.query = Object.fromEntries(url.searchParams);
    return profile(req, res);
  }
  if (url.pathname === '/api/exposure') {
    req.query = Object.fromEntries(url.searchParams);
    return exposure(req, res);
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(__dirname, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
    res.setHeader('Content-Type', types[path.extname(full)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
