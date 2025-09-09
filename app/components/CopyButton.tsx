import { useState } from 'react';

export default function CopyButton({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = html;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        'rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 cursor-pointer ' +
        (copied ? 'bg-green-600 hover:bg-green-700' : '')
      }
      title="Copy HTML to clipboard"
    >
      {copied ? 'Copied' : 'Copy HTML'}
    </button>
  );
}


