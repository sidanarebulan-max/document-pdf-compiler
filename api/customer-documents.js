const { getClients, findCustomer, getValues } = require('./_lib/google');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  try {
    const phone = req.query.phone || '';
    const customerId = req.query.customerId || '';
    const name = req.query.name || '';

    const clients = await getClients();
    const customer = await findCustomer(clients.sheets, { phone, customerId, name });
    if (!customer) return res.status(404).json({ ok:false, error:'CUSTOMER_NOT_FOUND' });

    const rows = await getValues(clients.sheets, 'DOCUMENTS!A2:L');
    const documents = rows
      .filter(r => r[1] === customer.customerId)
      .map(r => ({
        documentId:r[0]||'',
        customerId:r[1]||'',
        customerName:r[2]||'',
        documentType:r[3]||'',
        documentDate:r[4]||'',
        source:r[5]||'',
        originalFilename:r[6]||'',
        driveFileId:r[7]||'',
        driveFolderId:r[8]||'',
        status:r[9]||'',
        receivedAt:r[10]||'',
        notes:r[11]||''
      }))
      .filter(d => d.status !== 'DELETED');

    return res.status(200).json({ ok:true, customer, documents });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok:false, error:error.message });
  }
};
