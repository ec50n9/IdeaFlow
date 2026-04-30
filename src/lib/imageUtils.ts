import { saveImage, getImage } from './imageDB';

const BASE64_IMG_REGEX = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+)\)/g;
const IDB_REF_REGEX = /^idb:\/\/(.+)$/;

/**
 * 扫描 content 中的 markdown base64 图片，存入 IndexedDB，替换为 idb:// 引用。
 */
export async function extractAndStoreImages(content: string): Promise<string> {
  const matches = Array.from(content.matchAll(BASE64_IMG_REGEX));
  console.log('[imageUtils] extractAndStoreImages matches=', matches.length, 'content preview=', content.substring(0, 120));
  if (matches.length === 0) {
    console.log('[imageUtils] no base64 images found, returning as-is');
    return content;
  }

  let result = content;
  for (const match of matches) {
    const alt = match[1];
    const dataUrl = match[2];
    console.log('[imageUtils] storing image alt=', alt, 'dataUrl length=', dataUrl.length);
    const id = await saveImage(dataUrl);
    console.log('[imageUtils] replacing with idb://', id);
    result = result.replace(match[0], `![${alt}](idb://${id})`);
  }
  console.log('[imageUtils] result preview=', result.substring(0, 120));
  return result;
}

/**
 * 解析图片 src。如果是 idb:// 引用，从 IndexedDB 读取实际 dataUrl；否则原样返回。
 */
export async function resolveImageUrl(src: string): Promise<string> {
  const match = src.match(IDB_REF_REGEX);
  if (!match) return src;
  const dataUrl = await getImage(match[1]);
  return dataUrl || '';
}

/**
 * 从 content 中提取所有图片 URL（支持 dataUrl 和 idb:// 引用）。
 * 用于图生图时提取参考图。
 */
export async function extractImageUrls(content: string): Promise<string[]> {
  const images: string[] = [];

  // Markdown 图片: ![alt](url)
  const mdRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(content)) !== null) {
    images.push(mdMatch[1]);
  }

  // Base64 data URL（支持含换行符）
  const b64Regex = /data:image\/[^;]+;base64,[\sA-Za-z0-9+/=]+/g;
  let b64Match;
  while ((b64Match = b64Regex.exec(content)) !== null) {
    images.push(b64Match[0]);
  }

  // idb:// 引用
  const idbRegex = /!\[.*?\]\((idb:\/\/[^)]+)\)/g;
  let idbMatch;
  while ((idbMatch = idbRegex.exec(content)) !== null) {
    const resolved = await resolveImageUrl(idbMatch[1]);
    if (resolved) images.push(resolved);
  }

  return images;
}
