const crypto = require('crypto');\nconst { requireApiKey } = require('./_lib/security');
const {
  getClients,
  ensureCustomer,
  uploadBuffer,
  appendValues,
  env,
  safeName
} = require('./_lib/google');

function decodeBase64(value='') {
  const raw = String(value).replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(raw, 'base64');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });

  try {
    const {
      customerName='',
      phone='',
      customerId='',
      fileBase64='',
      outputFilename='',
      jobType='LOAN_DOCUMENT',
      filesUsed='',
      notes=''
    } = req.body || {};

    if (!fileBase64) return res.status(400).json({ ok:false, error:'fileBase64 diperlukan.' });
    if (!customerName && !phone && !customerId) {
      return res.status(400).json({ ok:false, error:'customerName, phone atau customerId diperlukan.' });
    }

    const clients = await getClients();
    const customer = await ensureCustomer(clients, { phone, customerId, name:customerName });
    const now = new Date().toISOString();
    const ymd = now.slice(0,10).replace(/-/g,'');
    const filename = outputFilename || (safeName(customer.name) + '_' + safeName(jobType) + '_' + ymd + '.pdf');

    const uploaded = await uploadBuffer(clients.drive, {
      buffer: decodeBase64(fileBase64),
      name: filename,
      mimeType: 'application/pdf',
      parentId: customer.folders.GENERATED
    });

    let shortcutId = null;
    try {
      const shortcut = await clients.drive.files.create({
        requestBody: {
          name: filename,
          mimeType: 'application/vnd.google-apps.shortcut',
          parents: [env('GENERATED_FOLDER_ID')],
          shortcutDetails: { targetId: uploaded.id }
        },
        fields:'id'
      });
      shortcutId = shortcut.data.id || null;
    } catch (e) {
      console.warn('Global generated shortcut gagal:', e.message);
    }

    const jobId = crypto.randomUUID();
    await appendValues(clients.sheets, 'JOBS!A:K', [
      jobId,
      customer.customerId,
      customer.name,
      jobType,
      now,
      'COMPLETED',
      String(filesUsed || ''),
      filename,
      uploaded.id,
      now,
      notes
    ]);

    return res.status(200).json({
      ok:true,
      jobId,
      customerId:customer.customerId,
      output:{
        filename,
        driveFileId:uploaded.id,
        webViewLink:uploaded.webViewLink || null,
        globalShortcutId:shortcutId
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok:false, error:error.message });
  }
};
