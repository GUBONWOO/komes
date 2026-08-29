export interface SortOption   { label: string; value: string }
export interface PriceOption  { label: string; min?: number; max?: number }
export interface YearOption   { label: string; from?: number }
export interface WalkOption   { label: string; max?: number }
export interface AreaOption   { label: string; value?: string }
export interface TypeOption   { label: string; value?: string }
export interface AreaSizeOption { label: string; min?: number; max?: number }

export const SORT_OPTIONS: SortOption[] = [
  { label: '新着順',            value: 'default'   },
  { label: '価格↑ 安い順',     value: 'price_asc' },
  { label: '価格↓ 高い順',     value: 'price_desc'},
  { label: '徒歩↑ 近い順',     value: 'walk_asc'  },
  { label: '徒歩↓ 遠い順',     value: 'walk_desc' },
  { label: '築年数↑ 新しい順', value: 'year_desc' },
  { label: '築年数↓ 古い順',   value: 'year_asc'  },
];

export const WALK_OPTIONS: WalkOption[] = [
  { label: 'すべて'   },
  { label: '5分以内',  max: 5  },
  { label: '10分以内', max: 10 },
  { label: '15分以内', max: 15 },
  { label: '20分以内', max: 20 },
  { label: '30分以内', max: 30 },
];

export const PRICE_OPTIONS: PriceOption[] = [
  { label: 'すべて'                         },
  { label: '2000万以下', max: 2000          },
  { label: '3000万以下', max: 3000          },
  { label: '4000万以下', max: 4000          },
  { label: '5000万以下', max: 5000          },
  { label: '5000万以上', min: 5000          },
];

export const YEAR_OPTIONS: YearOption[] = [
  { label: 'すべて'    },
  { label: '2020年〜', from: 2020 },
  { label: '2015年〜', from: 2015 },
  { label: '2010年〜', from: 2010 },
  { label: '2005年〜', from: 2005 },
  { label: '2000年〜', from: 2000 },
  { label: '1998年〜', from: 1998 },
];

export const BUILDING_TYPE_OPTIONS: TypeOption[] = [
  { label: 'すべて'                },
  { label: '一戸建て', value: 'ikkodate' },
  { label: 'マンション', value: 'mansion' },
];

export const AGE_TYPE_OPTIONS: TypeOption[] = [
  { label: 'すべて'              },
  { label: '新築', value: 'shinchiku' },
  { label: '中古', value: 'chuko'     },
];

export const AREA_OPTIONS: AreaOption[] = [
  { label: 'すべて'                   },
  { label: '東京都',    value: 'tokyo'    },
  { label: '埼玉県',   value: 'saitama'  },
  { label: '神奈川県', value: 'kanagawa' },
  { label: '千葉県',   value: 'chiba'    },
];

export const LAND_AREA_OPTIONS: AreaSizeOption[] = [
  { label: 'すべて'                  },
  { label: '50㎡以上',  min: 50  },
  { label: '60㎡以上',  min: 60  },
  { label: '70㎡以上',  min: 70  },
  { label: '80㎡以上',  min: 80  },
  { label: '100㎡以上', min: 100 },
];

export const BUILDING_AREA_OPTIONS: AreaSizeOption[] = [
  { label: 'すべて'                  },
  { label: '50㎡以上',  min: 50  },
  { label: '60㎡以上',  min: 60  },
  { label: '70㎡以上',  min: 70  },
  { label: '80㎡以上',  min: 80  },
  { label: '100㎡以上', min: 100 },
];

export const PAGE_LIMIT = 20;
