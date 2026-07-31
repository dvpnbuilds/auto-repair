import "server-only";
import {
  RequestBodyError,
  validateDeclaredLength,
} from "@/lib/api/bounded-bytes-core";
export {
  readBoundedBytes,
  RequestBodyError,
} from "@/lib/api/bounded-bytes-core";

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  validateDeclaredLength(request, maxBytes);

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
