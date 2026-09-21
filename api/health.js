const { getClients, env } = require('./_lib/google');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  try {
    const clients = await getClients();
    await clients.drive.files.get({ fileId: env('ROOT_FOLDER_ID'), fields:'id,name' });
    return res.status(200).json({
      ok:true,
      configured:true,
      storage:'google-drive',
      database:'google-sheets',
      version:'1.3.0'
    });
  } catch (error) {
    return res.status(200).json({
      ok:true,
      configured:false,
      storage:'local-first-fallback',
      error:error.message
    });
  }
};
