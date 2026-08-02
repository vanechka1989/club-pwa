import { apiUrl, getApiRequestHeaders } from "@/api/http";

export function resolveHomeworkUploadUrl(uploadPath: string, baseUrl = apiUrl) {
  if (/^https?:\/\//i.test(uploadPath)) return uploadPath;
  return `${baseUrl.replace(/\/$/, "")}/${uploadPath.replace(/^\//, "")}`;
}

export async function putHomeworkObject(
  uploadPath: string,
  file: File,
  contentType: string,
  fetchImpl: typeof fetch = fetch
) {
  let response: Response;
  try {
    response = await fetchImpl(resolveHomeworkUploadUrl(uploadPath), {
      method: "PUT",
      headers: getApiRequestHeaders({ "Content-Type": contentType }),
      credentials: "include",
      body: file
    });
  } catch {
    throw new Error("Не удалось загрузить файл. Проверьте интернет и попробуйте ещё раз.");
  }
  if (!response.ok) throw new Error("Не удалось загрузить файл. Попробуйте ещё раз.");
}
