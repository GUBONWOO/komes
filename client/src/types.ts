export interface Property {
  id: number;
  name: string | null;
  price: string | null;
  price_num: number | null;
  price_initial: number | null;
  walk_min: number | null;
  address: string | null;
  transport: string | null;
  land_area: string | null;
  land_area_num: number | null;
  building_area: string | null;
  building_area_num: number | null;
  layout: string | null;
  year_built: number | null;
  line_name: string | null;
  area: string | null;
  station: string | null;
  property_type: string | null;
  homes_url: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  price_change_count?: number;
  is_listed?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photo?: string;
}

export interface Stats {
  total: number;
  byLine: { line_name: string; count: string }[];
}

export interface StationInfo {
  station: string;
  count: string;
}

export interface PriceHistoryEntry {
  old_price: number;
  new_price: number;
  changed_at: string;
}

export interface PropertiesResponse {
  total: number | null;
  page: number;
  limit: number;
  data: Property[];
}

export interface GetPropertiesParams {
  line?: string;
  area?: string;
  station?: string;
  buildingType?: string;
  ageType?: string;
  priceMin?: number;
  priceMax?: number;
  yearFrom?: number;
  walkMax?: number;
  landAreaMin?: number;
  landAreaMax?: number;
  buildingAreaMin?: number;
  buildingAreaMax?: number;
  sortBy?: string;
  page?: number;
  limit?: number;
  skipCount?: 'true';
}
