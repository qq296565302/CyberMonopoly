export enum Market {
  SH = 'SH',
  SZ = 'SZ',
  BJ = 'BJ',
  HK = 'HK',
  US = 'US',
}

export function detectMarket(code: string): Market {
  if (typeof code !== 'string') code = String(code || '');
  const p = code.substring(0, 2);
  if (/^(60|68|51|50|52|56|58|11)$/.test(p)) return Market.SH;
  if (/^(00|30|12|15|16|18)$/.test(p)) return Market.SZ;
  if (/^(43|83|87|88|82|4|8)$/.test(p)) return Market.BJ;
  if (/^[a-zA-Z]/.test(code.charAt(0))) return Market.US;
  return Market.SH;
}

export interface WatchStock {
  code: string;
  name: string;
  market: Market;
  addedAt: number;
  notes?: string;
  alertPrice?: number;
  alertPercent?: number;
}

/**
 * 判断是否为 ETF/基金（需要显示3位小数）
 * 上交所: 51xxxx, 50xxxx, 52xxxx, 56xxxx, 58xxxx
 * 深交所: 15xxxx, 16xxxx
 */
export function isEtfOrFund(code: string): boolean {
  return /^5[01268]/.test(code) || /^1[56]/.test(code);
}

/**
 * 根据字符串生成确定性颜色（用于K线图等）
 */
export function hashColor(str: string): [number, number, number] {
  const colors: [number, number, number][] = [
    [86, 180, 233], [230, 159, 0], [0, 158, 115],
    [204, 121, 167], [213, 94, 0], [240, 228, 66],
  ];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return colors[sum % colors.length];
}
