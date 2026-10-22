// Converts the project's Markdown documents (BRD, TRD, User Manual, reports) to styled .docx files.
// Usage: node scripts/md2docx.cjs <input.md> <output.docx> "<header label>" <version> [<mermaid png prefix>]
// Env: DOC_FOOTER (e.g. "Versi {v} · Halaman "), DOC_OF (" dari "). Needs the npm packages `docx` and `marked`.
// Markdown images (![caption](img/x.png), PNG only) are embedded with the caption below them.
const fs = require('fs');
const { marked } = require('marked');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, Footer, Header,
  PageNumber, TableLayoutType, ImageRun,
} = require('docx');

const [, , inPath, outPath, label, version = '0.1', diagramPrefix] = process.argv;
let mermaidIndex = 0;
// Read PNG width/height from the IHDR chunk.
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const md = fs.readFileSync(inPath, 'utf8');
const path = require('path');
const baseDir = path.dirname(inPath);
const FOOTER = process.env.DOC_FOOTER || 'Version {v} · Page ';
const OF = process.env.DOC_OF || ' of ';
const tokens = marked.lexer(md);

const FONT = 'Calibri';
const MONO = 'Consolas';
const ACCENT = '9B0D23';
const HEAD_FILL = 'F3F4F6';
const CODE_FILL = 'F2F2F2';
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1080; // A4, 0.75"
const CONTENT_W = PAGE_W - 2 * MARGIN;

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Inline tokens -> TextRuns
function runs(inline, fmt = {}, size) {
  const out = [];
  for (const t of inline || []) {
    switch (t.type) {
      case 'strong': out.push(...runs(t.tokens, { ...fmt, bold: true }, size)); break;
      case 'em': out.push(...runs(t.tokens, { ...fmt, italics: true }, size)); break;
      case 'del': out.push(...runs(t.tokens, { ...fmt, strike: true }, size)); break;
      case 'codespan':
        out.push(new TextRun({ text: decode(t.text), font: MONO, size: size ? size - 2 : 19, ...fmt, shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } }));
        break;
      case 'link': out.push(...runs(t.tokens, { ...fmt, color: ACCENT, underline: {} }, size)); break;
      case 'br': out.push(new TextRun({ break: 1 })); break;
      case 'text':
        if (t.tokens && t.tokens.length) { out.push(...runs(t.tokens, fmt, size)); break; }
      // fallthrough
      case 'escape':
      case 'html':
      default: {
        const parts = decode(t.text ?? t.raw ?? '').split('\n');
        parts.forEach((p, i) => out.push(new TextRun({ text: p, ...fmt, size, break: i > 0 ? 1 : 0 })));
      }
    }
  }
  return out;
}

let listInstance = 0;
function blocks(toks, ctx = {}) {
  const out = [];
  for (const t of toks) {
    switch (t.type) {
      case 'heading': {
        const lvl = { 1: HeadingLevel.TITLE, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2, 4: HeadingLevel.HEADING_3 }[t.depth] || HeadingLevel.HEADING_4;
        out.push(new Paragraph({ heading: lvl, children: runs(t.tokens), keepNext: true }));
        break;
      }
      case 'paragraph':
        if ((t.tokens || []).some((x) => x.type === 'image')) {
          for (const img of t.tokens.filter((x) => x.type === 'image')) {
            const data = fs.readFileSync(path.resolve(baseDir, decodeURI(img.href)));
            const { w, h } = pngSize(data);
            const portrait = h > w;
            const scale = Math.min((portrait ? 260 : 640) / w, (portrait ? 560 : 700) / h);
            out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 80, after: 40 },
              children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
                altText: { title: img.text, description: img.text, name: img.text } })] }));
            out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
              children: [new TextRun({ text: img.text, italics: true, size: 17, color: '6B7280' })] }));
          }
          break;
        }
        out.push(new Paragraph({ children: runs(t.tokens), spacing: { after: 120 }, indent: ctx.indent ? { left: ctx.indent } : undefined, border: ctx.quote ? quoteBorder : undefined, shading: ctx.quote ? quoteShade : undefined }));
        break;
      case 'blockquote':
        out.push(...blocks(t.tokens, { ...ctx, indent: 284, quote: true }));
        break;
      case 'list': {
        const inst = ++listInstance;
        const level = ctx.listLevel || 0;
        for (const item of t.items) {
          let first = true;
          for (const sub of item.tokens) {
            if (sub.type === 'list') { out.push(...blocks([sub], { ...ctx, listLevel: level + 1 })); continue; }
            const inl = sub.type === 'text' || sub.type === 'paragraph' ? (sub.tokens || [{ type: 'text', text: sub.text }]) : null;
            if (!inl) { out.push(...blocks([sub], ctx)); continue; }
            out.push(new Paragraph({
              children: runs(inl),
              numbering: first ? { reference: t.ordered ? 'numbered' : 'bullets', level, instance: t.ordered ? inst : 0 } : undefined,
              indent: first ? undefined : { left: 720 * (level + 1) },
              spacing: { after: 60 },
            }));
            first = false;
          }
        }
        break;
      }
      case 'code': {
        if (t.lang === 'mermaid') {
          mermaidIndex++;
          const png = diagramPrefix && `${diagramPrefix}-${mermaidIndex}.png`;
          if (png && fs.existsSync(png)) {
            const data = fs.readFileSync(png);
            const { w, h } = pngSize(data);
            // Fit within content width (~650 px) and ~880 px height at 96 dpi.
            const scale = Math.min(640 / w, 880 / h, 1);
            out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
              children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })] }));
            break;
          }
        }
        const lines = t.text.split('\n');
        const note = t.lang === 'mermaid' ? [new Paragraph({ children: [new TextRun({ text: 'Diagram source (Mermaid notation):', italics: true, size: 18, color: '595959' })], spacing: { after: 40 } })] : [];
        out.push(...note);
        lines.forEach((line, i) => out.push(new Paragraph({
          children: [new TextRun({ text: line.length ? line : ' ', font: MONO, size: 16 })],
          shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' },
          spacing: { before: 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
          keepLines: true,
        })));
        break;
      }
      case 'table': out.push(table(t)); out.push(new Paragraph({ children: [], spacing: { after: 60 } })); break;
      case 'hr':
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } }, spacing: { after: 160 } }));
        break;
      case 'space': break;
      case 'html': break;
      default:
        if (t.tokens) out.push(new Paragraph({ children: runs(t.tokens) }));
        else if (t.text) out.push(new Paragraph({ children: [new TextRun(decode(t.text))] }));
    }
  }
  return out;
}

const quoteBorder = { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } };
const quoteShade = { type: ShadingType.CLEAR, fill: 'FDECEE', color: 'auto' };
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };

function plain(tokensOrText) {
  if (typeof tokensOrText === 'string') return tokensOrText;
  return (tokensOrText || []).map((x) => x.tokens ? plain(x.tokens) : (x.text || '')).join('');
}

function table(t) {
  const n = t.header.length;
  // Column widths proportional to content length (sqrt-damped), with a floor.
  const lens = t.header.map((h, i) => {
    const all = [plain(h.tokens), ...t.rows.map((r) => plain(r[i].tokens))];
    const max = Math.max(...all.map((s) => s.length));
    const avg = all.reduce((a, s) => a + s.length, 0) / all.length;
    return Math.max(6, Math.sqrt(max) * 0.4 + Math.sqrt(avg) * 0.6 * 2);
  });
  const size = n >= 6 ? 15 : 17;
  // Minimum width so the longest single word in a column never breaks mid-word.
  const charW = size * 5.2;
  const mins = t.header.map((h, i) => {
    const words = [plain(h.tokens), ...t.rows.map((r) => plain(r[i].tokens))].join(' ').split(/\s+/);
    const longest = Math.max(...words.map((w) => w.length));
    return Math.min(2400, Math.round(longest * charW + 200));
  });
  // If the minimums alone exceed the page width, scale them down to 90% of it.
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > CONTENT_W * 0.9) for (let i = 0; i < n; i++) mins[i] = Math.floor(mins[i] * (CONTENT_W * 0.9) / minSum);
  const total = lens.reduce((a, b) => a + b, 0);
  let widths = lens.map((l, i) => Math.max(mins[i], Math.round((l / total) * CONTENT_W)));
  // Shrink only the slack above each column's minimum until the table fits.
  const over = widths.reduce((a, b) => a + b, 0) - CONTENT_W;
  if (over > 0) {
    const slack = widths.map((w, i) => w - mins[i]);
    const slackTotal = slack.reduce((a, b) => a + b, 0) || 1;
    widths = widths.map((w, i) => Math.floor(w - over * (slack[i] / slackTotal)));
  } else {
    widths = widths.map((w) => Math.floor(w * (CONTENT_W / (CONTENT_W + over))));
  }
  widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);

  const mkCell = (cell, i, header) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: HEAD_FILL, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
    children: [new Paragraph({ children: runs(cell.tokens, header ? { bold: true } : {}, size), spacing: { after: 0 } })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: t.header.map((c, i) => mkCell(c, i, true)) }),
      ...t.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => mkCell(c, i, false)) })),
    ],
  });
}

const children = blocks(tokens);

const bulletLevels = [0, 1, 2].map((lvl) => ({
  level: lvl, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][lvl], alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } },
}));
const numberLevels = [0, 1, 2].map((lvl) => ({
  level: lvl, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][lvl], text: `%${lvl + 1}.`, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } },
}));

const doc = new Document({
  creator: 'DCU Active project team',
  title: label,
  styles: {
    default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { after: 100, line: 276 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 40, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { after: 240 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 260, after: 100 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '404040', font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 20, bold: true, italics: true, color: '404040', font: FONT }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, { reference: 'numbered', levels: numberLevels }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'DCU Active — ' + label, size: 16, color: '808080' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: FOOTER.replace('{v}', version), size: 16, color: '808080' }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '808080' }),
      new TextRun({ text: OF, size: 16, color: '808080' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '808080' }),
    ] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(outPath, buf); console.log('wrote', outPath, buf.length, 'bytes,', children.length, 'blocks'); });
