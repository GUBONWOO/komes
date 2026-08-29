import { PRICE_OPTIONS, WALK_OPTIONS, YEAR_OPTIONS, AREA_OPTIONS, AGE_TYPE_OPTIONS, BUILDING_TYPE_OPTIONS, LAND_AREA_OPTIONS, BUILDING_AREA_OPTIONS } from './constants';

interface FilterOption {
  label: string;
  [key: string]: unknown;
}

interface FilterGroupProps {
  label: string;
  options: FilterOption[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  disabled?: boolean;
}

function FilterGroup({ label, options, activeIdx, onSelect, disabled = false }: FilterGroupProps) {
  return (
    <div className={`filter-group ${disabled ? 'filter-group--disabled' : ''}`}>
      <span className="filter-group-label">{label}</span>
      <div className="filter-chips">
        {options.map((opt, i) => (
          <button
            key={i}
            className={`filter-chip ${activeIdx === i ? 'active' : ''}`}
            onClick={() => !disabled && onSelect(i)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FilterBarProps {
  buildingTypeIdx: number;
  onBuildingType: (idx: number) => void;
  ageTypeIdx: number;
  onAgeType: (idx: number) => void;
  areaIdx: number;
  onArea: (idx: number) => void;
  priceIdx: number;
  onPrice: (idx: number) => void;
  walkIdx: number;
  onWalk: (idx: number) => void;
  yearIdx: number;
  onYear: (idx: number) => void;
  landAreaIdx: number;
  onLandArea: (idx: number) => void;
  buildingAreaIdx: number;
  onBuildingArea: (idx: number) => void;
}

export default function FilterBar({
  buildingTypeIdx, onBuildingType,
  ageTypeIdx, onAgeType,
  areaIdx, onArea,
  priceIdx, onPrice,
  walkIdx, onWalk,
  yearIdx, onYear,
  landAreaIdx, onLandArea,
  buildingAreaIdx, onBuildingArea,
}: FilterBarProps) {
  const isShinchiku = AGE_TYPE_OPTIONS[ageTypeIdx]?.value === 'shinchiku';
  return (
    <div className="filter-bar">
      <FilterGroup label="建物種別" options={BUILDING_TYPE_OPTIONS} activeIdx={buildingTypeIdx}  onSelect={onBuildingType} />
      <FilterGroup label="種別"     options={AGE_TYPE_OPTIONS}       activeIdx={ageTypeIdx}       onSelect={onAgeType} />
      <FilterGroup label="エリア"   options={AREA_OPTIONS}           activeIdx={areaIdx}          onSelect={onArea} />
      <FilterGroup label="価格"     options={PRICE_OPTIONS}          activeIdx={priceIdx}         onSelect={onPrice} />
      <FilterGroup label="徒歩"     options={WALK_OPTIONS}           activeIdx={walkIdx}          onSelect={onWalk} />
      <FilterGroup label="土地"     options={LAND_AREA_OPTIONS}      activeIdx={landAreaIdx}      onSelect={onLandArea} />
      <FilterGroup label="建物"     options={BUILDING_AREA_OPTIONS}  activeIdx={buildingAreaIdx}  onSelect={onBuildingArea} />
      <FilterGroup label="築年数"   options={YEAR_OPTIONS}           activeIdx={yearIdx}          onSelect={onYear} disabled={isShinchiku} />
    </div>
  );
}
