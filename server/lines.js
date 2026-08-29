// 전체 노선 목록 — db.js와 crawler.js 양쪽에서 참조 (순환 의존성 방지용 분리)
// 슬러그는 HOMES URL에서 실제로 200을 반환하는 것만 사용
// https://homes.co.jp/chukoikkodate/{area}/{slug}/ 형식
const LINES = [
  // ── JR ──
  { name: '埼京線',         slug: 'en_saikyosen',          areas: ['saitama', 'tokyo', 'kanagawa'] },
  { name: '京浜東北線',     slug: 'en_keihintohokusen',    areas: ['saitama', 'tokyo'] },
  { name: '総武線',         slug: 'en_sobusen',            areas: ['chiba', 'tokyo'] },
  { name: '常磐線',         slug: 'en_jobansen',           areas: ['chiba', 'tokyo'] },
  { name: '中央線',         slug: 'en_chuosen',            areas: ['tokyo'] },
  { name: '山手線',         slug: 'en_yamanotesen',        areas: ['tokyo'] },
  { name: '東海道本線',     slug: 'en_tokaidohonsen',      areas: ['tokyo', 'kanagawa'] },
  { name: '横須賀線',       slug: 'en_yokosukasen',        areas: ['tokyo', 'kanagawa'] },
  { name: '南武線',         slug: 'en_nambusen',           areas: ['tokyo', 'kanagawa'] },
  { name: '武蔵野線',       slug: 'en_musashinosen',       areas: ['tokyo', 'saitama', 'chiba'] },
  { name: '横浜線',         slug: 'en_yokohamasen',        areas: ['tokyo', 'kanagawa'] },
  // ── 東京メトロ ──
  { name: '副都心線',       slug: 'en_fukutoshinsen',      areas: ['saitama', 'tokyo'] },
  { name: '有楽町線',       slug: 'en_yurakuchosen',       areas: ['saitama', 'tokyo'] },
  { name: '半蔵門線',       slug: 'en_hanzomonsen',        areas: ['tokyo'] },
  { name: '南北線',         slug: 'en_nambokusen',         areas: ['tokyo'] },
  { name: '千代田線',       slug: 'en_chiyodasen',         areas: ['tokyo'] },
  { name: '東西線',         slug: 'en_tozaisen',           areas: ['tokyo', 'chiba'] },
  { name: '日比谷線',       slug: 'en_hibiyasen',          areas: ['tokyo'] },
  { name: '丸ノ内線',       slug: 'en_marunouchisen',      areas: ['tokyo'] },
  { name: '銀座線',         slug: 'en_ginzasen',           areas: ['tokyo'] },
  // ── 都営 ──
  { name: '浅草線',         slug: 'en_toeiasakusasen',     areas: ['tokyo'] },
  { name: '三田線',         slug: 'en_toeimitasen',        areas: ['tokyo'] },
  { name: '都営新宿線',     slug: 'en_toeishinjukusen',    areas: ['tokyo'] },
  { name: '大江戸線',       slug: 'en_toeioedosen',        areas: ['tokyo'] },
  // ── 東急 ──
  { name: '東急東横線',     slug: 'en_tokyutoyokosen',     areas: ['tokyo', 'kanagawa'] },
  { name: '東急田園都市線', slug: 'en_tokyudenentoshisen', areas: ['tokyo', 'kanagawa'] },
  { name: '東急目黒線',     slug: 'en_tokyumegurosen',     areas: ['tokyo', 'kanagawa'] },
  { name: '東急大井町線',   slug: 'en_tokyuoimachisen',    areas: ['tokyo', 'kanagawa'] },
  { name: '東急多摩川線',   slug: 'en_tokyutamagawasen',   areas: ['tokyo'] },
  { name: '東急池上線',     slug: 'en_tokyuikegamisen',    areas: ['tokyo'] },
  // ── 小田急 ──
  { name: '小田急小田原線', slug: 'en_odakyusen',          areas: ['tokyo', 'kanagawa'] },
  { name: '小田急多摩線',   slug: 'en_odakyutamasen',      areas: ['tokyo', 'kanagawa'] },
  { name: '小田急江ノ島線', slug: 'en_odakyuenoshimasen',  areas: ['kanagawa'] },
  // ── 京王 ──
  { name: '京王線',         slug: 'en_keiosen',            areas: ['tokyo'] },
  { name: '京王井の頭線',   slug: 'en_keioinokashirasen',  areas: ['tokyo'] },
  // ── 西武 ──
  { name: '西武新宿線',     slug: 'en_seibushinjukusen',   areas: ['tokyo', 'saitama'] },
  { name: '西武池袋線',     slug: 'en_seibuikebukurosen',  areas: ['tokyo', 'saitama'] },
  // ── 東武 ──
  { name: '東武東上線',     slug: 'en_tobutojosen',        areas: ['tokyo', 'saitama'] },
  { name: '東武野田線',     slug: 'en_tobunodasen',        areas: ['saitama', 'chiba'] },
  // ── 京成 ──
  { name: '京成本線',       slug: 'en_keiseihonsen',       areas: ['tokyo', 'chiba'] },
  // ── その他 ──
  { name: 'りんかい線',         slug: 'en_rinkaisen',      areas: ['tokyo'] },
  { name: 'つくばエクスプレス', slug: 'en_tsukubaexpress', areas: ['tokyo', 'saitama', 'chiba'] },
];

// slug → 테이블명 (en_saikyosen → prop_saikyosen)
const getTableName = (slug) => `prop_${slug.replace(/^en_/, '')}`;

module.exports = { LINES, getTableName };
