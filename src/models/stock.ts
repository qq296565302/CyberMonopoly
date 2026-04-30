export enum Market {
  SH = 'SH',
  SZ = 'SZ',
  BJ = 'BJ',
  HK = 'HK',
  US = 'US',
}

export function detectMarket(code: string): Market {
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
