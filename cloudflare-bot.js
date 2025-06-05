const fs = require('fs');
const axios = require('axios');

// Fungsi: setelah user pilih domain, upload worker dengan domain tersebut
async function uploadWorkerJs(domain, apiToken, accountId, workerName) {
  // 1. Baca template worker.js
  let workerCode = fs.readFileSync('./worker.js', 'utf8');
  
  // 2. Replace placeholder dengan domain yang dipilih user
  workerCode = workerCode.replace(/___DOMAIN___/g, domain);
  
  // 3. Upload worker ke Cloudflare
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  const response = await axios.put(url, workerCode, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/javascript'
    }
  });
  
  return response.data;
}

// Contoh pemakaian (di handler setelah user pilih domain)
(async () => {
  const domain = 'yas.dianavip.xyz';          // hasil pilihan user
  const apiToken = 'CF_API_TOKEN';            // token dari user
  const accountId = 'CLOUDFLARE_ACCOUNT_ID';  // account id Cloudflare
  const workerName = 'myworker';              // nama worker
  
  try {
    const result = await uploadWorkerJs(domain, apiToken, accountId, workerName);
    console.log('Worker uploaded:', result);
  } catch (err) {
    console.error('Upload error:', err.response.data || err.message);
  }
})();
