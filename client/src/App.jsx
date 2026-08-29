import { useState, useEffect, useCallback, useRef } from 'react';
import { getProperties, getStats, getStations, getMe, logout, getWatchlist, addWatchlist, removeWatchlist } from './api';
import PropertyCard from './PropertyCard';
import FilterBar from './FilterBar';
import Pagination from './Pagination';
import LoginPage from './LoginPage';
import { IconChart, IconMoon, IconSun, IconHome, IconHeartFilled } from './icons';
import {
  SORT_OPTIONS,
  PRICE_OPTIONS,
  YEAR_OPTIONS,
  WALK_OPTIONS,
  AREA_OPTIONS,
  AGE_TYPE_OPTIONS,
  BUILDING_TYPE_OPTIONS,
  LAND_AREA_OPTIONS,
  BUILDING_AREA_OPTIONS,
  PAGE_LIMIT,
} from './constants';
import './App.css';

export default function App() {
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedLine, setSelectedLine] = useState('');
  const [selectedStations, setSelectedStations] = useState([]);
  const [stations, setStations] = useState([]);
  const [buildingTypeIdx, setBuildingTypeIdx] = useState(0);
  const [ageTypeIdx, setAgeTypeIdx] = useState(0);
  const [areaIdx, setAreaIdx] = useState(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [yearIdx, setYearIdx] = useState(0);
  const [walkIdx, setWalkIdx] = useState(0);
  const [landAreaIdx, setLandAreaIdx] = useState(0);
  const [buildingAreaIdx, setBuildingAreaIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const isPageChange = useRef(false);
  const abortRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [user, setUser] = useState(undefined); // undefined=로딩중, null=미로그인
  const [watchlist, setWatchlist] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    getMe()
      .then((r) => {
        setUser(r.data);
        return getWatchlist();
      })
      .then((r) => setWatchlist(r.data))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const toggleFavorite = async (property) => {
    const exists = watchlist.find((w) => w.homes_url === property.homes_url);
    if (exists) {
      await removeWatchlist(property.id);
      setWatchlist((prev) => prev.filter((w) => w.homes_url !== property.homes_url));
    } else {
      await addWatchlist(property.id);
      setWatchlist((prev) => [...prev, property]);
    }
  };

  const isAdmin = user?.email === 'admin@local';

  const fetchProperties = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    const buildingType = BUILDING_TYPE_OPTIONS[buildingTypeIdx];
    const ageType = AGE_TYPE_OPTIONS[ageTypeIdx];
    const area = AREA_OPTIONS[areaIdx];
    const price = PRICE_OPTIONS[priceIdx];
    const year = YEAR_OPTIONS[yearIdx];
    const walk = WALK_OPTIONS[walkIdx];
    const landArea = LAND_AREA_OPTIONS[landAreaIdx];
    const buildingArea = BUILDING_AREA_OPTIONS[buildingAreaIdx];
    try {
      const skipCount = isPageChange.current;
      const res = await getProperties(
        {
          line: selectedLine || undefined,
          area: area.value,
          station: selectedStations.length > 0 ? selectedStations.join(',') : undefined,
          buildingType: buildingType.value,
          ageType: ageType.value,
          priceMin: price.min,
          priceMax: price.max,
          yearFrom: year.from,
          walkMax: walk.max,
          landAreaMin: landArea.min,
          landAreaMax: landArea.max,
          buildingAreaMin: buildingArea.min,
          buildingAreaMax: buildingArea.max,
          sortBy: sortBy !== 'default' ? sortBy : undefined,
          page,
          limit: PAGE_LIMIT,
          skipCount: skipCount ? 'true' : undefined,
        },
        signal,
      );
      isPageChange.current = false;
      setProperties(res.data.data);
      if (res.data.total !== null) setTotal(res.data.total);
    } catch (e) {
      if (e.name !== 'CanceledError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, [
    selectedLine,
    selectedStations,
    buildingTypeIdx,
    ageTypeIdx,
    areaIdx,
    priceIdx,
    yearIdx,
    walkIdx,
    landAreaIdx,
    buildingAreaIdx,
    sortBy,
    page,
  ]);

  useEffect(() => {
    getStats()
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedStations([]);
    getStations(selectedLine || null)
      .then((r) => setStations(r.data))
      .catch(() => {});
  }, [selectedLine]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handlePageChange = (p) => {
    isPageChange.current = true;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilter = (setter) => (val) => {
    isPageChange.current = false;
    setter(val);
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  if (user === undefined) return null; // 인증 확인 중
  if (user === null) return <LoginPage />;

  return (
    <div className='app'>
      <div className='top-nav'>
        <div className='top-nav-inner'>
          <span className='top-nav-text'>スーモ独自調査ツール</span>
          <div className='top-nav-right'>
            <button
              className='theme-toggle'
              onClick={() => setDarkMode((v) => !v)}
              aria-label={darkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            >
              {darkMode ? <IconSun /> : <IconMoon />}
              {darkMode ? 'ライト' : 'ダーク'}
            </button>
            <div className='user-info'>
              {user.photo && <img className='user-avatar' src={user.photo} alt={user.name} />}
              <span className='user-name'>{user.name}</span>
              {!isAdmin && (
                <button className='logout-btn' onClick={handleLogout}>ログアウト</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <header className='header'>
        <div className='header-inner'>
          <div className='logo-area'>
            <div className='logo'>
              <span className='logo-s'>K</span>
              <span className='logo-uumo'>OOMO</span>
            </div>
            <div className='logo-sub'>一戸建て・マンション</div>
          </div>
          <button className='fav-header-btn' onClick={() => setShowFavorites(true)}>
            <IconHeartFilled />
            관심종목
            {watchlist.length > 0 && <span className='fav-header-count'>{watchlist.length}</span>}
          </button>
        </div>
      </header>

      {showFavorites && (
        <div className='fav-overlay' onClick={() => setShowFavorites(false)}>
          <div className='fav-panel' onClick={(e) => e.stopPropagation()}>
            <div className='fav-panel-header'>
              <span>관심종목 ({watchlist.length})</span>
              <button className='history-close' onClick={() => setShowFavorites(false)}>×</button>
            </div>
            <div className='fav-panel-body'>
              {watchlist.length === 0 ? (
                <p className='history-empty'>관심종목이 없습니다</p>
              ) : (
                <div className='property-list'>
                  {watchlist.map((p) => (
                    <PropertyCard
                      key={p.homes_url}
                      property={p}
                      isFavorite={true}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className='main-wrap'>
        <aside className='sidebar'>
          {stats && (
            <div className='sidebar-section'>
              <div className='sidebar-title'>
                <IconChart />
                路線別件数
              </div>
              <div className='stats-list'>
                <div
                  className={`stats-item ${!selectedLine ? 'active' : ''}`}
                  onClick={() => handleFilter(setSelectedLine)('')}
                >
                  <span className='stats-line-name'>全路線</span>
                  <span className='stats-count'>
                    {stats.total.toLocaleString()}
                  </span>
                </div>
                {stats.byLine.map((s) => (
                  <div
                    key={s.line_name}
                    className={`stats-item ${selectedLine === s.line_name ? 'active' : ''}`}
                    onClick={() => handleFilter(setSelectedLine)(s.line_name)}
                  >
                    <span className='stats-line-name'>{s.line_name}</span>
                    <span className='stats-count'>
                      {parseInt(s.count).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stations.length > 0 && (
            <div className='sidebar-section'>
              <div className='sidebar-title'>駅</div>
              <div className='stats-list'>
                <div
                  className={`stats-item ${selectedStations.length === 0 ? 'active' : ''}`}
                  onClick={() => { setSelectedStations([]); setPage(1); isPageChange.current = false; }}
                >
                  <span className='stats-line-name'>全駅</span>
                </div>
                {stations.map((s) => (
                  <div
                    key={s.station}
                    className={`stats-item ${selectedStations.includes(s.station) ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedStations((prev) =>
                        prev.includes(s.station)
                          ? prev.filter((x) => x !== s.station)
                          : [...prev, s.station]
                      );
                      setPage(1);
                      isPageChange.current = false;
                    }}
                  >
                    <span className='stats-line-name'>{s.station}</span>
                    <span className='stats-count'>
                      {parseInt(s.count).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className='main-content'>
          <FilterBar
            buildingTypeIdx={buildingTypeIdx}
            onBuildingType={handleFilter(setBuildingTypeIdx)}
            ageTypeIdx={ageTypeIdx}
            onAgeType={(i) => {
              handleFilter(setAgeTypeIdx)(i);
              if (AGE_TYPE_OPTIONS[i]?.value === 'shinchiku') setYearIdx(0);
            }}
            areaIdx={areaIdx}
            onArea={handleFilter(setAreaIdx)}
            priceIdx={priceIdx}
            onPrice={handleFilter(setPriceIdx)}
            walkIdx={walkIdx}
            onWalk={handleFilter(setWalkIdx)}
            landAreaIdx={landAreaIdx}
            onLandArea={handleFilter(setLandAreaIdx)}
            buildingAreaIdx={buildingAreaIdx}
            onBuildingArea={handleFilter(setBuildingAreaIdx)}
            yearIdx={yearIdx}
            onYear={handleFilter(setYearIdx)}
          />

          <div className='result-header'>
            <div className='result-count'>
              <span className='result-label'>検索結果</span>
              <span className='result-num'>{total.toLocaleString()}</span>
              <span className='result-unit'>件</span>
            </div>
            <div className='filter-area'>
              <select
                className='line-select'
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className='loading-state'>
              <div className='loading-spinner' />
              <p>物件を読み込み中...</p>
            </div>
          ) : properties.length === 0 ? (
            <div className='empty-state'>
              <div className='empty-icon'>
                <IconHome />
              </div>
              <p className='empty-title'>物件が見つかりません</p>
              <p className='empty-desc'>条件を変更してください</p>
            </div>
          ) : (
            <div className='property-list'>
              {properties.map((p) => (
                <PropertyCard
                  key={p.id}
                  property={p}
                  isFavorite={watchlist.some((w) => w.homes_url === p.homes_url)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPage={handlePageChange}
            />
          )}
        </main>
      </div>
    </div>
  );
}
