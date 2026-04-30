export interface DataPoint {
  date: Date;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  label: string;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color: [number, number, number];
  prevClose?: number;
  type: 'line' | 'candlestick';
}
