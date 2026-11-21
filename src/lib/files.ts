import { uid } from './db';
import type { Attachment } from './types';

export const MAX_ATTACHMENTS = 6;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;
const MAX_IMAGE_DIM = 1600;

export const FILE_ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.xml',
  '.html', '.htm', '.css', '.scss', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.sh', '.bash', '.zsh', '.sql', '.toml', '.ini', '.conf', '.cfg', '.log',
  '.svg', '.vue', '.svelte', '.astro',
].join(',');

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'cc', 'cpp', 'h', 'hpp',
  'cs', 'php', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'sql', 'toml', 'ini', 'conf', 'cfg',
  'env', 'log', 'svg', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'proto', 'tf', 'r',
  'dockerfile', 'makefile', 'gitignore', 'editorconfig', 'prisma',
]);

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const i = base.lastIndexOf('.');
  if (i <= 0) return base.toLowerCase();
  return base.slice(i + 1).toLowerCase();
}

export function classifyFile(file: Pick<File, 'name' | 'type'>): 'image' | 'pdf' | 'text' | null {
  const mime = (file.type || '').toLowerCase();
  if (IMAGE_TYPES.has(mime)) return 'image';
  if (mime === 'application/pdf' || extOf(file.name) === 'pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/x-yaml' ||
    mime === 'image/svg+xml' ||
    TEXT_EXTS.has(extOf(file.name))
  ) {
    return 'text';
  }
  return null;
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/** Downscale large raster images on-device so IndexedDB and API payloads stay fast and under provider limits. */
async function compressImage(file: File): Promise<{ dataUrl: string; mediaType: string }> {
  const rawUrl = await readDataUrl(file);
  if (file.type === 'image/gif' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUrl: rawUrl, mediaType: file.type || 'image/png' };
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = rawUrl;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MAX_IMAGE_DIM && file.size <= 1.2 * 1024 * 1024) {
      return { dataUrl: rawUrl, mediaType: file.type || 'image/png' };
    }
    const scale = Math.min(1, MAX_IMAGE_DIM / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: rawUrl, mediaType: file.type || 'image/png' };
    ctx.drawImage(img, 0, 0, w, h);
    const outType = file.type === 'image/png' && file.size < 900_000 ? 'image/png' : 'image/jpeg';
    const outUrl = canvas.toDataURL(outType, 0.86);
    return outUrl.length < rawUrl.length ? { dataUrl: outUrl, mediaType: outType } : { dataUrl: rawUrl, mediaType: file.type || 'image/png' };
  } catch {
    return { dataUrl: rawUrl, mediaType: file.type || 'image/png' };
  }
}

export type FileReject =
  | { reason: 'limit'; max: number }
  | { reason: 'tooBig'; name: string; max: string }
  | { reason: 'unsupported'; name: string };

/** Convert picked/dropped/pasted Files into local Attachment records. */
export async function readAttachments(
  files: File[],
  currentCount: number,
): Promise<{ added: Attachment[]; error?: FileReject }> {
  const added: Attachment[] = [];
  let error: FileReject | undefined;
  let slots = MAX_ATTACHMENTS - currentCount;

  for (const file of files) {
    if (slots <= 0) {
      error ??= { reason: 'limit', max: MAX_ATTACHMENTS };
      break;
    }
    const cls = classifyFile(file);
    if (!cls) {
      error ??= { reason: 'unsupported', name: file.name };
      continue;
    }
    if (cls === 'image') {
      if (file.size > MAX_IMAGE_BYTES) {
        error ??= { reason: 'tooBig', name: file.name, max: fmtBytes(MAX_IMAGE_BYTES) };
        continue;
      }
      const { dataUrl, mediaType } = await compressImage(file);
      added.push({ id: uid(), name: file.name || 'image.png', mediaType, size: file.size, kind: 'image', dataUrl });
      slots--;
    } else if (cls === 'pdf') {
      if (file.size > MAX_PDF_BYTES) {
        error ??= { reason: 'tooBig', name: file.name, max: fmtBytes(MAX_PDF_BYTES) };
        continue;
      }
      const dataUrl = await readDataUrl(file);
      added.push({ id: uid(), name: file.name, mediaType: 'application/pdf', size: file.size, kind: 'file', dataUrl });
      slots--;
    } else {
      if (file.size > MAX_TEXT_BYTES) {
        error ??= { reason: 'tooBig', name: file.name, max: fmtBytes(MAX_TEXT_BYTES) };
        continue;
      }
      const full = await file.text();
      const truncated = full.length > MAX_TEXT_CHARS;
      const text = truncated ? full.slice(0, MAX_TEXT_CHARS) : full;
      added.push({
        id: uid(),
        name: file.name,
        mediaType: file.type || 'text/plain',
        size: file.size,
        kind: 'text',
        text,
        truncated: truncated || undefined,
      });
      slots--;
    }
  }
  return { added, error };
}
