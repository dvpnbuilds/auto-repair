export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413
  ) {
    super(message);
  }
}

export function validateDeclaredLength(
  request: Request,
  maxBytes: number
): number | null {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return null;
  const declaredBytes = Number(contentLength);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
    throw new RequestBodyError("Invalid Content-Length", 400);
  }
  if (declaredBytes > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }
  return declaredBytes;
}

export async function readBoundedBytes(
  request: Request,
  maxBytes: number
): Promise<{bytes: Uint8Array; declaredBytes: number | null}> {
  const declaredBytes = validateDeclaredLength(request, maxBytes);
  if (!request.body) {
    return {bytes: new Uint8Array(), declaredBytes};
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {bytes, declaredBytes};
}
