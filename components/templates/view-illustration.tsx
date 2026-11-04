import * as React from "react";

/*
  Line illustrations of each default view for template cards (docs/10 section 12). Strokes use the border and
  brand tokens so they sit quietly on the card in both themes.
*/

type Props = { view: string; className?: string };

const stroke = "var(--color-border-strong)";
const accent = "var(--color-brand)";
const soft = "var(--color-border)";

export function ViewIllustration({ view, className }: Props) {
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden="true" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <rect x="0.75" y="0.75" width="158.5" height="94.5" rx="4" stroke={soft} />
      {view === "board" ? <Board /> : view === "timeline" || view === "gantt" ? <Timeline gantt={view === "gantt"} /> : view === "calendar" ? <Calendar /> : view === "table" ? <Table /> : <List />}
    </svg>
  );
}

function List() {
  return (
    <>
      <line x1="16" y1="20" x2="64" y2="20" stroke={accent} strokeWidth="2" />
      {[34, 46, 58, 70, 82].map((y, i) => (
        <g key={y}>
          <rect x="16" y={y - 4} width="8" height="8" rx="1.5" stroke={stroke} />
          <line x1="32" y1={y} x2={i % 2 ? 96 : 118} y2={y} stroke={stroke} />
          <circle cx="140" cy={y} r="4" stroke={stroke} />
        </g>
      ))}
    </>
  );
}

function Board() {
  return (
    <>
      {[14, 62, 110].map((x, col) => (
        <g key={x}>
          <line x1={x} y1="16" x2={x + 28} y2="16" stroke={col === 1 ? accent : stroke} strokeWidth="2" />
          {Array.from({ length: col === 0 ? 3 : col === 1 ? 2 : 1 }).map((_, i) => (
            <rect key={i} x={x} y={26 + i * 20} width="36" height="14" rx="2" stroke={stroke} />
          ))}
        </g>
      ))}
    </>
  );
}

function Timeline({ gantt }: { gantt: boolean }) {
  const rows = [
    { x: 20, w: 40, y: 30 },
    { x: 48, w: 52, y: 46 },
    { x: 84, w: 36, y: 62 },
    { x: 104, w: 40, y: 78 },
  ];
  return (
    <>
      {[20, 50, 80, 110, 140].map((x) => (
        <line key={x} x1={x} y1="14" x2={x} y2="86" stroke={soft} />
      ))}
      <line x1="14" y1="18" x2="146" y2="18" stroke={stroke} />
      {rows.map((r, i) => (
        <g key={i}>
          {gantt ? <line x1="8" y1={r.y} x2="16" y2={r.y} stroke={stroke} /> : null}
          <rect x={r.x} y={r.y - 4} width={r.w} height="8" rx="2" stroke={i === 1 ? accent : stroke} fill={i === 1 ? accent : "none"} />
          {gantt && i < rows.length - 1 ? <path d={`M${r.x + r.w} ${r.y} h6 v${16} h${rows[i + 1].x - (r.x + r.w) - 6}`} stroke={stroke} /> : null}
        </g>
      ))}
    </>
  );
}

function Calendar() {
  return (
    <>
      <line x1="12" y1="22" x2="148" y2="22" stroke={stroke} />
      {[12, 46, 80, 114].map((x) => (
        <line key={x} x1={x} y1="22" x2={x} y2="86" stroke={soft} />
      ))}
      {[22, 54].map((y) => (
        <line key={y} x1="12" y1={y + 32} x2="148" y2={y + 32} stroke={soft} />
      ))}
      <rect x="16" y="30" width="26" height="6" rx="1.5" fill={accent} />
      <rect x="50" y="30" width="60" height="6" rx="1.5" stroke={stroke} />
      <rect x="84" y="62" width="26" height="6" rx="1.5" stroke={stroke} />
      <rect x="118" y="62" width="26" height="6" rx="1.5" fill={accent} />
    </>
  );
}

function Table() {
  return (
    <>
      <line x1="12" y1="24" x2="148" y2="24" stroke={stroke} />
      {[60, 96, 124].map((x) => (
        <line key={x} x1={x} y1="12" x2={x} y2="86" stroke={soft} />
      ))}
      {[40, 56, 72].map((y) => (
        <g key={y}>
          <line x1="12" y1={y} x2="148" y2={y} stroke={soft} />
          <line x1="18" y1={y - 8} x2="50" y2={y - 8} stroke={stroke} />
          <line x1="66" y1={y - 8} x2="86" y2={y - 8} stroke={y === 56 ? accent : stroke} />
          <line x1="102" y1={y - 8} x2="116" y2={y - 8} stroke={stroke} />
        </g>
      ))}
    </>
  );
}
