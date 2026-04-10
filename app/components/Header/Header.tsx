import './Header.css';

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function Header({ searchQuery, onSearchChange }: Props) {
  return (
    <header>
      <div className="header-top">
        <div className="title-block">
          <h1>
            English <span>Grammar</span> Tree
          </h1>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Поиск по теме..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
