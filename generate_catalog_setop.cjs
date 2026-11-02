const fs = require('fs');
const path = require('path');

/**
 * Builds public/catalogo_setop.json from the text of the SICOR-MG (ex-SETOP)
 * reference price tables, as produced by:
 *
 *   pdftotext -layout -enc UTF-8 <tabela>.pdf sicor.txt
 *
 * Usage: node generate_catalog_setop.cjs <sicor.txt>
 *
 * The PDF holds three tables (edificação, rodoviárias, consultoria e
 * projetos). Each one lists bold group headers with a numeric code and, under
 * them, the services themselves, coded ED-/RO-/CO- with a unit and a unit
 * cost. The group headers are all drawn alike — the source makes no visual
 * distinction between a chapter and a sub-chapter — so groups are kept as one
 * flat level under the table they belong to, rather than inventing a nesting
 * the document does not express.
 */

const TABLES = [
  { match: 'PARA OBRAS DE EDIFICAÇÃO', code: 'SETOP-ED', label: 'EDIFICAÇÃO' },
  { match: 'PARA OBRAS RODOVIÁRIAS', code: 'SETOP-RO', label: 'OBRAS RODOVIÁRIAS' },
  { match: 'PARA CONSULTORIA E PROJETOS', code: 'SETOP-CO', label: 'CONSULTORIA E PROJETOS' },
];

// Page furniture that repeats on every page and must never reach the catalog.
// Each entry is punctuated or specific enough not to appear inside a service
// description. Even so, rows are parsed before this filter runs, so a real
// service can never be dropped by it.
const NOISE = [
  'Página:', 'TABELA REFERENCIAL', 'Região Central', 'JANEIRO/2026',
  'DESCRIÇÃO DO SERVIÇO', 'www.', 'Fone:', 'Fax:', 'Email:', 'CEP:',
  'SEINFRA-MG', 'DEPARTAMENTO DE ESTRADAS', 'sicor@der.mg.gov.br',
];

const CODE_RE = /^(?:ED|RO|CO)-\d+$/;
const PRICE_RE = /^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
const GROUP_RE = /^\s{2,}(\d{3,6})\s{2,}(\S.*?)\s*$/;
const CONT_RE = /^\s{6,}(\S.*?)\s*$/;

const isNoise = line => NOISE.some(n => line.includes(n));
const toNumber = raw => parseFloat(raw.replace(/\./g, '').replace(',', '.'));

/**
 * Reads one service row.
 *
 * Columns are separated by runs of two or more spaces, while the code and the
 * start of the description sit in the same column one space apart, and a unit
 * may itself contain a space ("PR A1", "% A1" in the consultancy table). So
 * the row is split on the wide gaps and read from both ends: last field is the
 * cost, the one before it the unit, and everything else the description.
 *
 * Requiring a trailing cost is what keeps prose out: a wrapped line such as
 * "CA-1 COM DEGRAUS DE AÇO CA-50" opens with something that looks like a code
 * but carries no cost, so it stays part of the description above it.
 */
function parseItemRow(line) {
  const fields = line.trim().split(/\s{2,}/);
  if (fields.length < 3) return null;

  const price = fields[fields.length - 1];
  if (!PRICE_RE.test(price)) return null;

  // The code usually shares a column with the first words of the description,
  // one space apart, but parts of the road table put it in a column of its own.
  const head = fields[0];
  const spaceAt = head.indexOf(' ');
  const code = spaceAt === -1 ? head : head.slice(0, spaceAt);
  if (!CODE_RE.test(code)) return null;

  const unit = fields[fields.length - 2];
  const firstWords = spaceAt === -1 ? [] : [head.slice(spaceAt + 1)];
  const description = [...firstWords, ...fields.slice(1, fields.length - 2)].join(' ');

  return { code, description: description.trim(), unit: unit.trim(), price: toNumber(price) };
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const catalog = [];

  let table = null;
  let group = null;
  let current = null; // the entry still open for continuation lines

  const closeCurrent = () => {
    if (current) {
      current.description = current.description.replace(/\s+/g, ' ').trim();
      current = null;
    }
  };

  for (const line of lines) {
    const detected = TABLES.find(t => line.includes(t.match));
    if (detected && detected.code !== (table && table.code)) {
      closeCurrent();
      table = detected;
      group = null;
      catalog.push({
        item: table.code,
        description: table.label,
        unit: '',
        price: 0,
        isCategory: true,
        rows: [],
        source: 'SETOP',
        level: 0,
      });
      continue;
    }

    if (!table || !line.trim()) {
      // A blank line does not end a wrapped description: the tables put
      // vertical space between rows, so only a new coded row closes one.
      continue;
    }

    const item = parseItemRow(line);
    if (item) {
      closeCurrent();
      current = {
        item: item.code,
        description: item.description,
        unit: item.unit,
        price: item.price,
        isCategory: false,
        rows: [],
        source: 'SETOP',
        table: table.code,
        group: group ? group.item : table.code,
      };
      catalog.push(current);
      continue;
    }

    const grp = line.match(GROUP_RE);
    if (grp) {
      closeCurrent();
      group = {
        item: `${table.code}-${grp[1]}`,
        code: grp[1],
        description: grp[2].trim(),
        unit: '',
        price: 0,
        isCategory: true,
        rows: [],
        source: 'SETOP',
        table: table.code,
        level: 1,
      };
      catalog.push(group);
      current = group;
      continue;
    }

    if (isNoise(line)) continue;

    const cont = line.match(CONT_RE);
    if (cont && current) {
      // A wrap can break right before punctuation, as in "ROSCA E-27" /
      // ", FORNECIMENTO E INSTALAÇÃO"; joining those with a space would leave
      // a gap in front of the comma.
      const separator = /^[,.;:)%]/.test(cont[1]) ? '' : ' ';
      current.description += separator + cont[1];
    }
  }

  closeCurrent();
  return catalog;
}

const input = process.argv[2];
if (!input) {
  console.error('Uso: node generate_catalog_setop.cjs <sicor.txt>');
  process.exit(1);
}

const catalog = parse(fs.readFileSync(input, 'utf8'));

const items = catalog.filter(c => !c.isCategory);
const groups = catalog.filter(c => c.isCategory && c.level === 1);
const tables = catalog.filter(c => c.isCategory && c.level === 0);

const outputPath = path.resolve(__dirname, 'public', 'catalogo_setop.json');
// Written without indentation: at over six thousand services the pretty
// printed file is around 2.4 MB, and the browser downloads this whole catalog.
fs.writeFileSync(outputPath, JSON.stringify(catalog));

console.log(`Gerado ${outputPath}`);
console.log(`  Tabelas: ${tables.length}, Grupos: ${groups.length}, Itens: ${items.length}`);

const semPreco = items.filter(i => !(i.price > 0)).length;
const semUnidade = items.filter(i => !i.unit).length;
const descCurta = items.filter(i => i.description.length < 10).length;
console.log(`  Sem preço: ${semPreco}, sem unidade: ${semUnidade}, descrição suspeita: ${descCurta}`);
console.log('  Unidades distintas:', [...new Set(items.map(i => i.unit))].sort().join(' '));
