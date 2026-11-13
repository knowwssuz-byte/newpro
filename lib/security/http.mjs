export class HttpError extends Error {
  constructor(status, message, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function assertSameOrigin(request, required = false) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site' ||
      (origin && origin !== new URL(request.url).origin) || (required && !origin && site !== 'same-origin')) {
    throw new HttpError(403, 'Origin ruxsat etilmagan.');
  }
}

// Check the actual stream, including chunked requests with no Content-Length.
export async function readLimitedBytes(message, maxBytes = 128 * 1024) {
  const declared = message.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new HttpError(413, 'So‘rov hajmi juda katta.');
  }
  if (!message.body) return Buffer.alloc(0);
  const reader = message.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'So‘rov hajmi juda katta.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export async function readJson(request, maxBytes = 128 * 1024) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'JSON so‘rov yuboring.');
  }
  const bytes = await readLimitedBytes(request, maxBytes);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw new HttpError(400, 'So‘rov formati noto‘g‘ri.'); }
}

export async function readForm(request, maxBytes = 12 * 1024 * 1024) {
  const bytes = await readLimitedBytes(request, maxBytes);
  try {
    return await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
  } catch { throw new HttpError(400, 'Fayl so‘rovi noto‘g‘ri.'); }
}

export function securityError(error) {
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json({ ok: false, error: error instanceof HttpError ? error.message : 'Xizmat vaqtincha mavjud emas.' }, {
    status, headers: { 'Cache-Control': 'private, no-store',
      ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) },
  });
}
