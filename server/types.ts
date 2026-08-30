export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photo?: string;
}

export interface Area {
  name: string;
  slug: string;
  prefecture: string;
}

export interface UrlType {
  type: string;
  path: string;
  label: string;
}

export interface CrawlGroup {
  id: string;
  name: string;
  cron: string;
  areas: string[];
}

export interface RawBrowserItem {
  name: string | null;
  price: string | null;
  address: string | null;
  transport: string | null;
  layout: string | null;
  buildingArea: string | null;
  landArea: string | null;
  yearBuilt: string | null;
  floor: string | null;
  url: string | null;
  imageUrl: string | null;
}

export interface PropertyItem {
  name: string | null;
  price: string | null;
  price_num: number | null;
  address: string | null;
  transport: string | null;
  land_area: string | null;
  land_area_num: number | null;
  building_area: string | null;
  building_area_num: number | null;
  layout: string | null;
  year_built: number | null;
  property_type: string;
  homes_url: string | null;
  image_url: string | null;
  line_name: string | null;
  station: string | null;
  walk_min: number | null;
  area: string;
}

export interface SaveResult {
  saved: number;
  updated: number;
  deleted: number;
  deleteSkipped: boolean;
}

export interface CrawlSummary {
  area: string;
  total: number;
  saved: number;
  updated: number;
  deleted: number;
}

// Express Request 확장 (passport.js 방식)
declare global {
  namespace Express {
    interface User extends UserProfile {}
  }
}
