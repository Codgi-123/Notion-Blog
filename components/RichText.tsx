import React from 'react';
import type { RichTextWithHtml } from '../lib/types';

// Render an array of Notion rich-text items, honoring annotations and links.
export function RichText({ rich }: { rich: RichTextWithHtml[] }) {
  return (
    <>
      {rich.map((item, i) => {
        const { annotations, plain_text } = item;
        const href = item.href;

        // Inline equation: KaTeX rendered at build time (see lib/notion-render).
        if (item.type === 'equation' && item.__eqHtml) {
          return (
            <span
              key={i}
              className="inline-equation"
              dangerouslySetInnerHTML={{ __html: item.__eqHtml }}
            />
          );
        }

        let node: React.ReactNode = plain_text;

        if (annotations.code) node = <code className="inline-code">{node}</code>;
        if (annotations.bold) node = <strong>{node}</strong>;
        if (annotations.italic) node = <em>{node}</em>;
        if (annotations.strikethrough) node = <s>{node}</s>;
        if (annotations.underline) node = <u>{node}</u>;

        const style: React.CSSProperties = {};
        if (annotations.color && annotations.color !== 'default') {
          if (annotations.color.endsWith('_background')) {
            style.backgroundColor = colorVar(annotations.color);
          } else {
            style.color = colorVar(annotations.color);
          }
        }

        if (href) {
          node = (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          );
        }

        return (
          <span key={i} style={style}>
            {node}
          </span>
        );
      })}
    </>
  );
}

// Map Notion color names to CSS values (mirrors Notion's palette loosely).
function colorVar(color: string): string {
  const base = color.replace('_background', '');
  const map: Record<string, string> = {
    gray: '#787774',
    brown: '#9f6b53',
    orange: '#d9730d',
    yellow: '#cb912f',
    green: '#448361',
    blue: '#337ea9',
    purple: '#9065b0',
    pink: '#c14c8a',
    red: '#d44c47',
  };
  const bgMap: Record<string, string> = {
    gray: '#f1f1ef',
    brown: '#f4eeee',
    orange: '#fbecdd',
    yellow: '#fbf3db',
    green: '#edf3ec',
    blue: '#e7f3f8',
    purple: '#f6f3f9',
    pink: '#faf1f5',
    red: '#fdebec',
  };
  return color.endsWith('_background') ? bgMap[base] ?? 'transparent' : map[base] ?? 'inherit';
}
