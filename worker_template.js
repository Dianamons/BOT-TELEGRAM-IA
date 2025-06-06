export default {
  async fetch(request, env, ctx) {
    const DOMAIN = "example.com";
    const WILDCARD = "WILDCARD_PLACEHOLDER";
    // Implementasi logika subdomain/wildcard bisa kamu lanjutkan di sini
    return new Response(
      `Worker aktif!\nDomain: ${DOMAIN}\nWildcard: ${WILDCARD}`,
      { headers: { "content-type": "text/plain" } }
    );
  }
}
