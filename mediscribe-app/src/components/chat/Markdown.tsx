// A markdown subset renderer for assistant replies.
//
// Deliberately not a markdown library. The assistant's output format is
// constrained by its own prompt — bold, bullets, headings and tables are the
// whole vocabulary — and a full CommonMark parser would be a dependency and a
// bundle cost for grammar that is never produced. Anything unrecognised falls
// through as plain text rather than showing raw syntax.
import React from 'react';
import { View, Text } from 'react-native';

/** Split a line into runs, honouring **bold** and `code`. */
function inline(text: string, keyPrefix: string, baseClass: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={`${keyPrefix}-${i}`} className={`${baseClass} font-bold`}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text key={`${keyPrefix}-${i}`} className={`${baseClass} font-mono`}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return (
      <Text key={`${keyPrefix}-${i}`} className={baseClass}>
        {part}
      </Text>
    );
  });
}

const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|');
const isDivider = (l: string) => /^\|[\s:|-]+\|$/.test(l.trim());
const cells = (l: string) =>
  l.trim().slice(1, -1).split('|').map((c) => c.trim());

function Table({ rows }: { rows: string[] }) {
  const parsed = rows.filter((r) => !isDivider(r)).map(cells);
  if (!parsed.length) return null;
  const [head, ...body] = parsed;

  // Columns share the bubble width with flex-1 — NO horizontal ScrollView. A
  // horizontal ScrollView with no height bound was stretching to fill unbounded
  // space, which is what rendered as a tall empty white box. Height is now
  // driven entirely by the rows.
  return (
    <View className="mt-2 mb-0.5 rounded-xl border border-slate-200 overflow-hidden">
      <View className="flex-row bg-slate-50">
        {head.map((c, i) => (
          <Text key={i} className="flex-1 text-[11px] font-bold text-slate-500 px-3 py-2" numberOfLines={1}>
            {c}
          </Text>
        ))}
      </View>
      {body.map((row, r) => (
        <View key={r} className={`flex-row ${r < body.length - 1 ? 'border-b border-slate-100' : ''}`}>
          {row.map((c, i) => (
            <Text key={i} className="flex-1 text-[12.5px] text-slate-700 px-3 py-2" numberOfLines={1}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function Markdown({ content, tone = 'dark' }: { content: string; tone?: 'dark' | 'light' }) {
  const base = tone === 'light' ? 'text-white text-[14.5px] leading-[21px]' : 'text-slate-800 text-[14.5px] leading-[21px]';
  const lines = content.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTableRow(line)) {
      const block: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) block.push(lines[i++]);
      i--;
      out.push(<Table key={`t-${i}`} rows={block} />);
      continue;
    }

    if (!line.trim()) {
      out.push(<View key={`s-${i}`} style={{ height: 6 }} />);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      out.push(
        <Text key={`h-${i}`} className={`${tone === 'light' ? 'text-white' : 'text-slate-900'} font-bold text-[15px] mt-1.5 mb-0.5`}>
          {heading[2]}
        </Text>,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(
        <View key={`b-${i}`} className="flex-row mt-1">
          <Text className={`${base} mr-1.5`}>•</Text>
          <Text className={`${base} flex-1`}>{inline(bullet[1], `b${i}`, base)}</Text>
        </View>,
      );
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push(
        <View key={`n-${i}`} className="flex-row mt-1">
          <Text className={`${base} mr-1.5 font-semibold`}>{numbered[1]}.</Text>
          <Text className={`${base} flex-1`}>{inline(numbered[2], `n${i}`, base)}</Text>
        </View>,
      );
      continue;
    }

    out.push(
      <Text key={`p-${i}`} className={`${base} mt-0.5`}>
        {inline(line, `p${i}`, base)}
      </Text>,
    );
  }

  return <View>{out}</View>;
}
