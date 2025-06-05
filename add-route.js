const axios = require('axios');

async function addRoute(zoneId, pattern, scriptName, apiToken) {
  // pattern contoh: "ava.game.naver.com.yas.dianavip.xyz/*"
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;
  const response = await axios.post(url, {
    pattern,
    script: scriptName
  }, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// Contoh pemakaian
(async () => {
  const zoneId = 'CLOUDFLARE_ZONE_ID'; // zone id dari domain user
  const pattern = 'ava.game.naver.com.yas.dianavip.xyz/*';
  const scriptName = 'myworker';
  const apiToken = 'CF_API_TOKEN';
  
  try {
    const result = await addRoute(zoneId, pattern, scriptName, apiToken);
    console.log('Route added:', result);
  } catch (err) {
    console.error('Route error:', err.response.data || err.message);
  }
})();
