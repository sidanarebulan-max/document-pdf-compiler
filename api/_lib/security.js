function requireApiKey(req) {
  const expected = process.env.FARIS_API_KEY;
  if (!expected) {
    const e = new Error('FARIS_API_KEY belum dikonfigurasi di Vercel.');
    e.statusCode = 503;
    throw e;
  }
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const header = String(req.headers['x-faris-key'] || '');
  const supplied = bearer || header;
  if (!supplied || supplied !== expected) {
    const e = new Error('UNAUTHORIZED');
    e.statusCode = 401;
    throw e;
  }
}

module.exports = { requireApiKey };
