import React, { useMemo } from 'react';
import { marked } from 'marked';

interface SafeMarkdownProps {
  text: string;
  className?: string;
}

const ALLOWED_TAGS = new Set([
  'A', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'H1', 'H2', 'H3',
  'LI', 'OL', 'P', 'PRE', 'STRONG', 'UL',
]);

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const sanitizeMarkedHtml = (html: string): string => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return '';
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Element);
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    if (!ALLOWED_TAGS.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    const originalHref = node.tagName === 'A' ? node.getAttribute('href') || '' : '';
    Array.from(node.attributes).forEach((attr) => node.removeAttribute(attr.name));

    if (node.tagName === 'A' && originalHref) {
      try {
        const parsed = new URL(originalHref, window.location.origin);
        if (ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
          node.setAttribute('href', parsed.href);
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      } catch {
        // Unsafe or malformed links become plain link text.
      }
    }
  });

  return doc.body.innerHTML;
};

export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className = '' }) => {
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { async: false }) as string;
    return sanitizeMarkedHtml(raw);
  }, [text]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default SafeMarkdown;
