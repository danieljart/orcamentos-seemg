/**
 * Utility for evaluating math expressions in "memória de cálculo" and quantities.
 * Supports:
 * - Basic arithmetic: +, -, *, /
 * - Power operator: ^ (e.g. 2^3 = 8, 3^2 = 9, (2+3)^2 = 25)
 * - Square root: raiz(...), raíz(...), sqrt(...), √... (e.g. raiz(16) = 4, raiz 9 = 3)
 * - Decimals with dot or comma (e.g. 2,5 * 4 = 10)
 * - Multiplications with x, X, * or implicit (e.g. 2 x 3 = 6, 2raiz(9) = 6)
 * - Parentheses and negative numbers (e.g. -(2+3) = -5, 2^-1 = 0.5)
 */

type TokenType = 'NUMBER' | 'OP' | 'LPAREN' | 'RPAREN' | 'ROOT';

interface Token {
  type: TokenType;
  value: string;
}

export function evaluateMath(expr: any): string {
  if (expr === null || expr === undefined || expr === '') return '';

  try {
    let raw = String(expr).trim();
    if (raw.startsWith('=')) {
      raw = raw.substring(1).trim();
    }
    if (!raw) return '';

    // Convert decimal commas to dots
    raw = raw.replace(/,/g, '.');
    // Convert 'x' or 'X' used as multiplication to '*'
    raw = raw.replace(/x/gi, '*');

    const tokens: Token[] = [];
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Root functions: raiz, raíz, sqrt, √ (case-insensitive)
      const rem = raw.slice(i);
      const rootMatch = rem.match(/^(?:raiz|raíz|sqrt|√)/i);
      if (rootMatch) {
        tokens.push({ type: 'ROOT', value: rootMatch[0] });
        i += rootMatch[0].length;
        continue;
      }

      // Numbers (integers and decimals)
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(raw[i + 1] || ''))) {
        let numStr = '';
        while (i < raw.length && (/[0-9]/.test(raw[i]) || raw[i] === '.')) {
          numStr += raw[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: numStr });
        continue;
      }

      // Parentheses
      if (ch === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
        continue;
      }
      if (ch === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
        continue;
      }

      // Operators (+, -, *, /, ^)
      if (['+', '-', '*', '/', '^'].includes(ch)) {
        tokens.push({ type: 'OP', value: ch });
        i++;
        continue;
      }

      // Unrecognized character -> invalid expression
      return '';
    }

    if (tokens.length === 0) return '';

    // Insert implicit multiplications:
    // NUMBER LPAREN -> NUMBER * LPAREN  (e.g. 2(3))
    // RPAREN LPAREN -> RPAREN * LPAREN  (e.g. (2)(3))
    // NUMBER ROOT   -> NUMBER * ROOT    (e.g. 2raiz(4))
    // RPAREN ROOT   -> RPAREN * ROOT    (e.g. (2)raiz(4))
    // RPAREN NUMBER -> RPAREN * NUMBER  (e.g. (2)3)
    const expandedTokens: Token[] = [];
    for (let t = 0; t < tokens.length; t++) {
      const curr = tokens[t];
      const prev = expandedTokens[expandedTokens.length - 1];
      if (prev) {
        const prevCanBeMultiplied = prev.type === 'NUMBER' || prev.type === 'RPAREN';
        const currNeedsMultiply =
          curr.type === 'LPAREN' ||
          curr.type === 'ROOT' ||
          (prev.type === 'RPAREN' && curr.type === 'NUMBER');
        if (prevCanBeMultiplied && currNeedsMultiply) {
          expandedTokens.push({ type: 'OP', value: '*' });
        }
      }
      expandedTokens.push(curr);
    }

    let pos = 0;
    const peek = () => expandedTokens[pos];
    const consume = (expectedType?: TokenType, expectedVal?: string) => {
      const tok = expandedTokens[pos];
      if (!tok) return null;
      if (expectedType && tok.type !== expectedType) return null;
      if (expectedVal && tok.value !== expectedVal) return null;
      pos++;
      return tok;
    };

    function parseExpression(): number {
      let left = parseTerm();
      while (pos < expandedTokens.length) {
        const tok = peek();
        if (tok && tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
          consume();
          const right = parseTerm();
          if (tok.value === '+') left = left + right;
          else left = left - right;
        } else {
          break;
        }
      }
      return left;
    }

    function parseTerm(): number {
      let left = parsePower();
      while (pos < expandedTokens.length) {
        const tok = peek();
        if (tok && tok.type === 'OP' && (tok.value === '*' || tok.value === '/')) {
          consume();
          const right = parsePower();
          if (tok.value === '*') left = left * right;
          else {
            if (right === 0) return NaN;
            left = left / right;
          }
        } else {
          break;
        }
      }
      return left;
    }

    function parsePower(): number {
      let left = parseUnary();
      const tok = peek();
      if (tok && tok.type === 'OP' && tok.value === '^') {
        consume();
        const right = parsePower(); // right-associative power
        left = Math.pow(left, right);
      }
      return left;
    }

    function parseUnary(): number {
      const tok = peek();
      if (tok && tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
        consume();
        const operand = parseUnary();
        return tok.value === '-' ? -operand : operand;
      }
      return parsePrimary();
    }

    function parsePrimary(): number {
      const tok = peek();
      if (!tok) throw new Error('Unexpected end of expression');

      if (tok.type === 'ROOT') {
        consume();
        let operand: number;
        if (peek()?.type === 'LPAREN') {
          consume('LPAREN');
          operand = parseExpression();
          if (!consume('RPAREN')) throw new Error('Missing closing parenthesis');
        } else {
          operand = parseUnary();
        }
        if (operand < 0) return NaN;
        return Math.sqrt(operand);
      }

      if (tok.type === 'NUMBER') {
        consume();
        const val = parseFloat(tok.value);
        if (isNaN(val)) throw new Error('Invalid number');
        return val;
      }

      if (tok.type === 'LPAREN') {
        consume();
        const val = parseExpression();
        if (!consume('RPAREN')) throw new Error('Missing closing parenthesis');
        return val;
      }

      throw new Error(`Unexpected token: ${tok.value}`);
    }

    const result = parseExpression();
    if (pos !== expandedTokens.length) {
      return '';
    }

    if (!Number.isFinite(result) || isNaN(result)) {
      return '';
    }

    return String(Number(result.toFixed(2)));
  } catch (e) {
    return '';
  }
}
