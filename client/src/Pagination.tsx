interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPage }: PaginationProps) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}>
        ＜ 前へ
      </button>
      <div className="page-numbers">
        {pages.map((num) => (
          <button
            key={num}
            className={`page-num ${num === page ? 'current' : ''}`}
            onClick={() => onPage(num)}
          >
            {num}
          </button>
        ))}
      </div>
      <button className="page-btn" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
        次へ ＞
      </button>
    </div>
  );
}
