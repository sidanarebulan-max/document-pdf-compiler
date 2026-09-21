const { google } = require('googleapis');
const { Readable } = require('stream');

const DEFAULTS = {
  ROOT_FOLDER_ID: '17gUQoOrBiDl4pPpx2fZuqF6bnHZTCjGt',
  CUSTOMERS_FOLDER_ID: '1_TFsKbtbCgadW4GUrMxh-TF2v6Ra7z_q',
  INBOX_FOLDER_ID: '1nCr1EYdmsrgt5XEiCQJJ2abUi_tlo23v',
  UNMATCHED_FOLDER_ID: '1E6YXjbp8k7ZhfhD3mHcBBOUx0x3Lw8b9',
  GENERATED_FOLDER_ID: '1Ilbl28DZ5bCRKQ8lvcU9cBW0v7-JAzBx',
  DATABASE_SPREADSHEET_ID: '1gATf8FzpmAF4bCWd_OQSdVbKVuFM-QAzwKliMfQFllE'
};

const FOLDERS = ['PROFILE','IC','LICENSE','PAYSLIP','BANK_STATEMENT','VSO','OTHER','GENERATED'];

function env(name) {
  return process.env[name] || DEFAULTS[name] || '';
}

function parseCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  throw new Error('Google Drive belum dikonfigurasi. Set GOOGLE_SERVICE_ACCOUNT_JSON atau GOOGLE_SERVICE_ACCOUNT_BASE64 di Vercel.');
}

async function getClients() {
  const credentials = parseCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
  const authClient = await auth.getClient();
  return {
    drive: google.drive({ version: 'v3', auth: authClient }),
    sheets: google.sheets({ version: 'v4', auth: authClient })
  };
}

function normalizePhone(value='') {
  let s = String(value).replace(/\D/g, '');
  if (s.startsWith('60')) s = '0' + s.slice(2);
  return s;
}

function safeName(value='CUSTOMER') {
  return String(value || 'CUSTOMER')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'CUSTOMER';
}

function normalizeDocType(value='', filename='') {
  const raw = String(value || '').toUpperCase().trim();
  const aliases = {
    LESEN: 'LICENSE',
    LICENSE: 'LICENSE',
    IC: 'IC',
    MYKAD: 'IC',
    PAYSLIP: 'PAYSLIP',
    'PAY SLIP': 'PAYSLIP',
    BANK: 'BANK_STATEMENT',
    BANK_STATEMENT: 'BANK_STATEMENT',
    'BANK STATEMENT': 'BANK_STATEMENT',
    VSO: 'VSO',
    OTHER: 'OTHER'
  };
  if (aliases[raw]) return aliases[raw];

  const s = String(filename || '').toLowerCase();
  if (/\b(vso)\b|vehicle[ _-]*sales[ _-]*order/.test(s)) return 'VSO';
  if (/\b(ic|mykad|nric)\b|kad[ _-]*pengenalan/.test(s)) return 'IC';
  if (/lesen|licen[cs]e/.test(s)) return 'LICENSE';
  if (/pay[ _-]*slip|salary[ _-]*slip|slip[ _-]*gaji/.test(s)) return 'PAYSLIP';
  if (/bank|statement|penyata/.test(s)) return 'BANK_STATEMENT';
  return 'OTHER';
}

async function getValues(sheets, range) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: env('DATABASE_SPREADSHEET_ID'),
    range
  });
  return r.data.values || [];
}

async function appendValues(sheets, range, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: env('DATABASE_SPREADSHEET_ID'),
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });
}

async function findCustomer(sheets, { phone='', customerId='', name='' } = {}) {
  const rows = await getValues(sheets, 'CUSTOMERS!A2:G');
  const p = normalizePhone(phone);
  const n = safeName(name);
  for (const row of rows) {
    const [id, rowPhone, rowName, folderId, status, createdAt, updatedAt] = row;
    if (customerId && id === customerId) return { customerId:id, phone:rowPhone||'', name:rowName||'', folderId, status, createdAt, updatedAt };
    if (p && normalizePhone(rowPhone) === p) return { customerId:id, phone:rowPhone||'', name:rowName||'', folderId, status, createdAt, updatedAt };
    if (!p && name && safeName(rowName) === n) return { customerId:id, phone:rowPhone||'', name:rowName||'', folderId, status, createdAt, updatedAt };
  }
  return null;
}

async function createFolder(drive, name, parentId) {
  const r = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id,name'
  });
  return r.data;
}

async function getChildFolder(drive, parentId, name) {
  const escaped = name.replace(/'/g, "\\'");
  const r = await drive.files.list({
    q: "'"+parentId+"' in parents and name='"+escaped+"' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name)',
    pageSize: 10
  });
  return (r.data.files || [])[0] || null;
}

async function ensureCustomerFolders(drive, rootId) {
  const map = {};
  for (const name of FOLDERS) {
    let f = await getChildFolder(drive, rootId, name);
    if (!f) f = await createFolder(drive, name, rootId);
    map[name] = f.id;
  }
  return map;
}

async function createCustomer(clients, { phone='', name='' }) {
  const now = new Date().toISOString();
  const p = normalizePhone(phone);
  const customerId = p || ('CUST_' + Date.now());
  const displayName = String(name || 'CUSTOMER').trim() || 'CUSTOMER';
  const folderName = (p ? p + '_' : '') + safeName(displayName);
  const folder = await createFolder(clients.drive, folderName, env('CUSTOMERS_FOLDER_ID'));
  const folders = await ensureCustomerFolders(clients.drive, folder.id);
  await appendValues(clients.sheets, 'CUSTOMERS!A:G', [
    customerId, p, displayName, folder.id, 'ACTIVE', now, now
  ]);
  return { customerId, phone:p, name:displayName, folderId:folder.id, folders, created:true };
}

async function ensureCustomer(clients, input={}) {
  let customer = await findCustomer(clients.sheets, input);
  if (!customer) return createCustomer(clients, input);
  customer.folders = await ensureCustomerFolders(clients.drive, customer.folderId);
  customer.created = false;
  return customer;
}

async function uploadBuffer(drive, { buffer, name, mimeType, parentId }) {
  const stream = Readable.from(buffer);
  const r = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: stream },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink'
  });
  return r.data;
}

module.exports = {
  env,
  getClients,
  normalizePhone,
  safeName,
  normalizeDocType,
  getValues,
  appendValues,
  findCustomer,
  ensureCustomer,
  uploadBuffer,
  getChildFolder
};
