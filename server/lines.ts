import type { Area } from './types';

export const LINES: Area[] = [
  // ── 東京都 23区 ──
  { name: '千代田区', slug: 'chiyoda-city',   prefecture: 'tokyo' },
  { name: '中央区',   slug: 'chuo-city',       prefecture: 'tokyo' },
  { name: '港区',     slug: 'minato-city',     prefecture: 'tokyo' },
  { name: '新宿区',   slug: 'shinjuku-city',   prefecture: 'tokyo' },
  { name: '文京区',   slug: 'bunkyo-city',     prefecture: 'tokyo' },
  { name: '台東区',   slug: 'taito-city',      prefecture: 'tokyo' },
  { name: '墨田区',   slug: 'sumida-city',     prefecture: 'tokyo' },
  { name: '江東区',   slug: 'koto-city',       prefecture: 'tokyo' },
  { name: '品川区',   slug: 'shinagawa-city',  prefecture: 'tokyo' },
  { name: '目黒区',   slug: 'meguro-city',     prefecture: 'tokyo' },
  { name: '大田区',   slug: 'ota-city',        prefecture: 'tokyo' },
  { name: '世田谷区', slug: 'setagaya-city',   prefecture: 'tokyo' },
  { name: '渋谷区',   slug: 'shibuya-city',    prefecture: 'tokyo' },
  { name: '中野区',   slug: 'nakano-city',     prefecture: 'tokyo' },
  { name: '杉並区',   slug: 'suginami-city',   prefecture: 'tokyo' },
  { name: '豊島区',   slug: 'toshima-city',    prefecture: 'tokyo' },
  { name: '北区',     slug: 'kita-city',       prefecture: 'tokyo' },
  { name: '荒川区',   slug: 'arakawa-city',    prefecture: 'tokyo' },
  { name: '板橋区',   slug: 'itabashi-city',   prefecture: 'tokyo' },
  { name: '練馬区',   slug: 'nerima-city',     prefecture: 'tokyo' },
  { name: '足立区',   slug: 'adachi-city',     prefecture: 'tokyo' },
  { name: '葛飾区',   slug: 'katsushika-city', prefecture: 'tokyo' },
  { name: '江戸川区', slug: 'edogawa-city',    prefecture: 'tokyo' },
  // ── 神奈川県 ──
  { name: '横浜市',   slug: 'yokohama-city',   prefecture: 'kanagawa' },
  { name: '川崎市',   slug: 'kawasaki-city',   prefecture: 'kanagawa' },
  // ── 埼玉県 ──
  { name: 'さいたま市', slug: 'saitama-city',  prefecture: 'saitama' },
  { name: '川口市',   slug: 'kawaguchi-city',  prefecture: 'saitama' },
  // ── 千葉県 ──
  { name: '千葉市',   slug: 'chiba-city',      prefecture: 'chiba' },
  { name: '船橋市',   slug: 'funabashi-city',  prefecture: 'chiba' },
  { name: '市川市',   slug: 'ichikawa-city',   prefecture: 'chiba' },
];

export const getTableName = (slug: string): string =>
  `prop_${slug.replace(/-/g, '_')}`;
