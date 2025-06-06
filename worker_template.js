export default {
  async fetch(request, env, ctx) {
    // Bagian ini akan diganti otomatis oleh bot
    const DOMAIN = "example.com";
    const WILDCARD = "*.sub.example.com";

    // Ambil hostname dari request
    const url = new URL(request.url);
    const host = url.hostname;

    // Pisahkan host & domain jadi array
    const hostParts = host.split(".");
    const domainParts = DOMAIN.split(".");

    // Cek apakah host diakhiri dengan DOMAIN yang di-set
    const isMainDomain = hostParts.slice(-domainParts.length).join(".") === DOMAIN;

    // Ambil pattern wildcard yang di-set, misal: *.sub.example.com
    // Ubah wildcard menjadi regex, misal: *.sub.example.com -> ^([^.]+)\.sub\.example\.com$
    function wildcardToRegex(wildcard) {
      // Escape dot
      let pattern = wildcard.replace(/\./g, "\\.");
      // Ganti * dengan grup subdomain
      pattern = pattern.replace(/\*/g, "([^.]+)");
      // ^...$ agar match persis
      return new RegExp("^" + pattern + "$");
    }

    const wildcardRegex = wildcardToRegex(WILDCARD);

    // Cek apakah host cocok dengan wildcard
    const isWildcardMatch = wildcardRegex.test(host);

    // Ambil subdomain yang cocok jika wildcard match
    let wildcardMatch = null;
    if (isWildcardMatch) {
      wildcardMatch = host.match(wildcardRegex).slice(1); // Array subdomain wildcard
    }

    // Output
    if (isWildcardMatch) {
      return new Response(
        `✅ Match wildcard!
Wildcard: ${WILDCARD}
Domain utama: ${DOMAIN}
Host: ${host}
Subdomain wildcard: ${JSON.stringify(wildcardMatch)}
Level subdomain: ${wildcardMatch.length}`,
        { headers: { "content-type": "text/plain" } }
      );
    } else if (isMainDomain) {
      const subdomains = hostParts.slice(0, -domainParts.length);
      return new Response(
        `🌐 Ini domain utama (${DOMAIN})\nSubdomain: ${subdomains.join(".") || "(tidak ada)"}\nArray: ${JSON.stringify(subdomains)}`,
        { headers: { "content-type": "text/plain" } }
      );
    } else {
      return new Response(
        `❌ Host tidak cocok wildcard apapun\nHost: ${host}\nWildcard: ${WILDCARD}`,
        { headers: { "content-type": "text/plain" } }
      );
    }
  }
}
