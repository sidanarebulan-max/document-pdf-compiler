const crypto = require('crypto');\nconst { requireApiKey } = require('./_lib/security');
const {
  getClients,
  normalizeDocType,
  ensureCustomer,
  uploadBuffer,
  appendValues
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
      documentType='',
      source='chat',
      originalFilename='document.bin',
      mimeType='application/octet-stream',
      fileBase64='',
      documentDate='',
      notes=''
    } = req.body || {};

    if (!fileBase64) return res.status(400).json({ ok:false, error:'fileBase64 diperlukan.' });
    if (!customerName && !phone && !customerId) {
      return res.status(400).json({ ok:false, error:'customerName, phone atau customerId diperlukan.' });
    }

    const clients = await getClients();
    const customer = await ensureCustomer(clients, { phone, customerId, name:customerName });
    const type = normalizeDocType(documentType, originalFilename);
    const receivedAt = new Date().toISOString();
    const dateTag = documentDate || receivedAt.slice(0,10);
    const cleanOriginal = String(originalFilename || 'document.bin').replace(/[\\/:*?"<>|]+/g, '_');
    const finalName = type + '_' + dateTag + '_' + cleanOriginal;

    const buffer = decodeBase64(fileBase64);
    const uploaded = await uploadBuffer(clients.drive, {
      buffer,
      name: finalName,
      mimeType,
      parentId: customer.folders[type] || customer.folders.OTHER
    });

    const documentId = crypto.randomUUID();
    await appendValues(clients.sheets, 'DOCUMENTS!A:L', [
      documentId,
      customer.customerId,
      customer.name,
      type,
      documentDate || '',
      source,
      originalFilename,
      uploaded.id,
      customer.folders[type] || customer.folders.OTHER,
      'ACTIVE',
      receivedAt,
      notes
    ]);

    return res.status(200).json({
      ok:true,
      customer:{
        customerId:customer.customerId,
        phone:customer.phone,
        name:customer.name,
        folderId:customer.folderId,
        created:customer.created
      },
      document:{
        documentId,
        documentType:type,
        driveFileId:uploaded.id,
        filename:uploaded.name,
        webViewLink:uploaded.webViewLink || null
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok:false, error:error.message });
  }
};
