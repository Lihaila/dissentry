import { Check, Copy } from 'lucide-react';
import { isValidElement, memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useT } from '../i18n';

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const langMatch = child?.props.className?.match(/language-([\w+-]+)/);
  const lang = langMatch?.[1];
  const raw = extractText(child ? child.props.children : children).replace(/\n$/, '');

  return (
    <div className="code-block group relative overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/90">
      <div className="code-chrome flex items-center justify-between border-b border-slate-200/70 bg-slate-100/70 px-3.5 py-1.5 text-[11.5px] text-slate-500">
        <span className="font-mono font-medium uppercase tracking-wider text-slate-400">{lang ?? 'code'}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-slate-500 transition hover:bg-white hover:text-ink"
          aria-label={copied ? t('post.copied') : t('post.copy')}
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
          <span>{copied ? t('post.copied') : t('post.copy')}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={`md ${streaming ? 'caret' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={streaming ? [] : [[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
