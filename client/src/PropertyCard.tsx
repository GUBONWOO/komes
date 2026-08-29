import { useState, useEffect } from 'react';
import { IconPin, IconTrain, IconHome, IconHeart, IconHeartFilled } from './icons';
import { getPriceHistory } from './api';
import type { Property, PriceHistoryEntry } from './types';

interface PriceHistoryModalProps {
  homesUrl: string;
  onClose: () => void;
}

function PriceHistoryModal({ homesUrl, onClose }: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPriceHistory(homesUrl)
      .then((r) => setHistory(r.data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [homesUrl]);

  const fmt = (n: number) => Number(n).toLocaleString();
  const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <span>価格変更履歴</span>
          <button className="history-close" onClick={onClose}>×</button>
        </div>
        <div className="history-body">
          {loading ? (
            <p className="history-empty">読み込み中...</p>
          ) : history.length === 0 ? (
            <p className="history-empty">履歴がありません</p>
          ) : (
            <ul className="history-list">
              {history.map((h, i) => {
                const diff = h.new_price - h.old_price;
                const down = diff < 0;
                return (
                  <li key={i} className="history-item">
                    <span className="history-date">{fmtDate(h.changed_at)}</span>
                    <span className="history-prices">
                      <span className="history-old">{fmt(h.old_price)}万円</span>
                      <span className="history-arrow">→</span>
                      <span className="history-new">{fmt(h.new_price)}万円</span>
                    </span>
                    <span className={`history-diff ${down ? 'down' : 'up'}`}>
                      {down ? '↓' : '↑'}{fmt(Math.abs(diff))}万円
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface PropertyCardProps {
  property: Property;
  isFavorite: boolean;
  onToggleFavorite: (property: Property) => void;
}

export default function PropertyCard({ property: p, isFavorite, onToggleFavorite }: PropertyCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const hasChange = (p.price_change_count ?? 0) > 0;
  const isSold = p.is_listed === false;

  return (
    <>
      <div className={`card${isSold ? ' card-sold' : ''}`}>
        <div className="card-image">
          {p.image_url ? (
            <img
              className="card-img"
              src={p.image_url}
              alt={p.name ?? '物件写真'}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const next = e.currentTarget.nextSibling as HTMLElement | null;
                if (next) next.style.display = 'flex';
              }}
            />
          ) : null}
          <div className="image-placeholder" style={p.image_url ? { display: 'none' } : {}}>
            <IconHome />
            <span className="image-placeholder-text">外観写真なし</span>
          </div>
          <div className="card-badges">
            <span className="badge badge-line">{p.line_name}</span>
          </div>
        </div>

        <div className="card-info">
          <div className="card-price-row">
            <span className="card-price">{p.price}</span>
            {hasChange && (
              <button className="price-change-badge" onClick={() => setHistoryOpen(true)}>
                価格履歴あり
              </button>
            )}
            {p.layout && <span className="card-layout">{p.layout}</span>}
            <button
              className={`heart-btn${isFavorite ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(p); }}
            >
              {isFavorite ? <IconHeartFilled /> : <IconHeart />}
            </button>
          </div>

          {p.name && <div className="card-name">{p.name}</div>}

          <div className="card-details">
            <div className="detail-row">
              <span className="detail-icon"><IconPin /></span>
              <span className="detail-label">所在地</span>
              <span className="detail-value">{p.address ?? '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-icon"><IconTrain /></span>
              <span className="detail-label">交通</span>
              <span className="detail-value transport">{p.transport ?? '-'}</span>
            </div>
            <div className="detail-specs">
              <div className="spec-item">
                <span className="spec-label">土地面積</span>
                <span className="spec-value">{p.land_area ?? '-'}</span>
              </div>
              <div className="spec-sep" />
              <div className="spec-item">
                <span className="spec-label">建物面積</span>
                <span className="spec-value">{p.building_area ?? '-'}</span>
              </div>
              <div className="spec-sep" />
              <div className="spec-item">
                <span className="spec-label">築年月</span>
                <span className="spec-value">{p.year_built ? `${p.year_built}年` : '-'}</span>
              </div>
            </div>
          </div>

          {p.homes_url && (
            <a className={`card-cta${isSold ? ' card-cta-sold' : ''}`} href={p.homes_url} target="_blank" rel="noreferrer">
              {isSold ? '販売終了' : 'HOMESで詳細を見る'}
              <span className="cta-arrow">→</span>
            </a>
          )}
        </div>
      </div>

      {historyOpen && p.homes_url && (
        <PriceHistoryModal homesUrl={p.homes_url} onClose={() => setHistoryOpen(false)} />
      )}
    </>
  );
}
