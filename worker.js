addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
async function handleRequest(request) {
  const host = new URL(request.url).host
  return new Response(`Akses dari: ${host}`, {
    headers: { 'content-type': 'text/plain' }
  })
}
