addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const DOMAIN = "example.com";
  const WILDCARD = "*.sub.example.com";

  const url = new URL(request.url);
  const host = url.hostname;
  const hostParts = host.split(".");
  const domainParts = DOMAIN.split(".");

  // Cek apakah host diakhiri dengan DOMAIN
  const isMainDomain = hostParts.slice(-domainParts.length).join(".") === DOMAIN;

  function wildcardToRegex(wildcard) {
    let pattern = wildcard.replace(/\./g, "\\.");
    pattern = pattern.replace(/\*/g, "([^.]+)");
    return new RegExp("^" + pattern + "$");
  }

  const wildcardRegex = wildcardToRegex(WILDCARD);
  const isWildcardMatch = wildcardRegex.test(host);

  let wildcardMatch = null;
  if (isWildcardMatch) {
    wildcardMatch = host.match(wildcardRegex).slice(1); // Array subdomain wildcard
  }

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
