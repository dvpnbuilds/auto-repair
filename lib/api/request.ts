import "server-only";

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413
  ) {
    super(message);
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0
    ) {
      throw new RequestBodyError("Invalid Content-Length", 400);
    }
    if (declaredBytes > maxBytes) {
      throw new RequestBodyError("Request body is too large", 413);
    }
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large", 413);
    }
    text += decoder.decode(value, {stream: true});
  }
  text += decoder.decode();

  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}
