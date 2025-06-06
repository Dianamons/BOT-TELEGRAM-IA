export default {
  async fetch(request, env, ctx) {
    const DOMAIN = "example.com";
    const url = new URL(request.url);
    const host = url.hostname;
    const hostParts = host.split(".");
    const domainParts = DOMAIN.split(".");
    const isMainDomain = hostParts.slice(-domainParts.length).join(".") === DOMAIN;

    if (isMainDomain) {
      const subdomains = hostParts.slice(0, -domainParts.length);
      if (subdomains.length >= 1) {
        return new Response(
          `Jumlah level subdomain: ${subdomains.length}\nSubdomain: ${subdomains.join(".")}\nArray: ${JSON.stringify(subdomains)}`,
          { headers: { "content-type": "text/plain" } }
        )
      } else {
        return new Response(
          "Ini domain utama (tanpa subdomain)",
          { headers: { "content-type": "text/plain" } }
        )
      }
    } else {
      return new Response(
        "Domain tidak dikenali",
        { headers: { "content-type": "text/plain" } }
      )
    }
  }
}
