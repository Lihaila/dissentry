import { domToBlob } from 'modern-screenshot';

export const SHARE_URL = 'https://dissentry.lihaila.com';

/** Shorten long markdown for the card without breaking code fences. */
export function clipMarkdown(text: string, max = 900): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const para = cut.lastIndexOf('\n\n');
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (para > max * 0.5) cut = cut.slice(0, para);
  else if (sentence > max * 0.5) cut = cut.slice(0, sentence + 1);
  if ((cut.match(/```/g) ?? []).length % 2 === 1) cut += '\n```';
  return `${cut.trimEnd()}\n\n…`;
}

/** Render a DOM node to a PNG blob, on this device. Nothing is uploaded. */
export async function renderPng(node: HTMLElement): Promise<Blob> {
  await document.fonts?.ready;
  // 2x: 2400px wide, sharp on retina screens and still well under X's limits.
  return domToBlob(node, { scale: 2, backgroundColor: '#ffffff', type: 'image/png', font: false });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copy a PNG to the clipboard. Accepts a promise so Safari keeps the user gesture. */
export async function copyPng(blob: Blob | Promise<Blob>): Promise<boolean> {
  try {
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
    return true;
  } catch {
    return false;
  }
}

export function canShareFiles(): boolean {
  try {
    const f = new File([new Blob()], 'x.png', { type: 'image/png' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

export const xIntentUrl = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
