const ALLOWED_DOMAIN = "___DOMAIN___";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const host = new URL(request.url).host;
  if (!host.endsWith(ALLOWED_DOMAIN)) {
    return new Response("Domain tidak diizinkan!", { status: 403 });
  }
  return new Response("Akses dari: " + host, {
    headers: { 'content-type': 'text/plain' }
  });
}
