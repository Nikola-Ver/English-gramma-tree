import { DATA } from '../../data/grammar';
import type { DoneMap } from '../../hooks/useProgress';
import { countAll } from '../../hooks/useProgress';
import { copyToClipboard } from '../../utils/clipboard';
import { buildGlobalTestPrompt } from '../../utils/prompts';
import { LevelBlock } from './LevelBlock';

interface Props {
  done: DoneMap;
  onToggleRule: (id: string) => void;
  onReset: () => void;
  searchQuery: string;
}

export function GrammarTab({ done, onToggleRule, onReset, searchQuery }: Props) {
  const { total, checked } = countAll(done);
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const q = searchQuery.trim().toLowerCase();

  const forceOpenSet = new Set<string>();
  if (q) {
    DATA.forEach((lvl) => {
      if (lvl.id.toLowerCase().includes(q) || lvl.name.toLowerCase().includes(q)) {
        forceOpenSet.add(lvl.id);
        return;
      }
      lvl.categories.forEach((cat) => {
        if (cat.name.toLowerCase().includes(q)) {
          forceOpenSet.add(lvl.id);
          return;
        }
        cat.rules.forEach((rule) => {
          if (`${rule.text} ${rule.note || ''}`.toLowerCase().includes(q)) {
            forceOpenSet.add(lvl.id);
          }
        });
      });
    });
  }

  const hasResults = !q || forceOpenSet.size > 0;

  async function handleGlobalTest(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = e.currentTarget;
    const doneRules: {
      rule: import('../../data/grammar').Rule;
      level: import('../../data/grammar').Level;
      category: import('../../data/grammar').Category;
    }[] = [];
    DATA.forEach((lvl) => {
      lvl.categories.forEach((cat) => {
        cat.rules.forEach((rule) => {
          if (done[rule.id]) doneRules.push({ rule, level: lvl, category: cat });
        });
      });
    });
    if (doneRules.length === 0) {
      alert('Сначала отметь хотя бы одно правило как изученное!');
      return;
    }
    const orig = btn.innerHTML;
    const prompt = buildGlobalTestPrompt(doneRules);
    await copyToClipboard(prompt);
    btn.textContent = '✓ Скопировано!';
    setTimeout(() => {
      if (btn) btn.innerHTML = orig;
    }, 2000);
  }

  function handleReset() {
    if (window.confirm('Сбросить весь прогресс?')) {
      onReset();
    }
  }

  return (
    <div id="pane-grammar" className="tab-pane active">
      <div className="grammar-header">
        <div className="grammar-progress-block">
          <div className="grammar-progress-nums">
            <span className="grammar-checked">{checked}</span>
            <span className="grammar-total"> / {total} правил</span>
          </div>
          <div className="grammar-bar-bg">
            <div className="grammar-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="grammar-pct">{pct}% завершено</div>
        </div>
        <button className="global-test-btn" onClick={handleGlobalTest}>
          <span className="btn-icon">🧠</span> Тест по изученным правилам
        </button>
      </div>

      <div className="level-path">
        {DATA.map((level) => (
          <LevelBlock
            key={level.id}
            level={level}
            done={done}
            onToggleRule={onToggleRule}
            searchQuery={searchQuery}
            forceOpen={forceOpenSet.has(level.id)}
          />
        ))}
      </div>
      {!hasResults && <div className="no-results">Ничего не найдено по запросу</div>}
      <button className="reset-btn" style={{ marginTop: '2rem' }} onClick={handleReset}>
        ↺ Сбросить прогресс
      </button>
    </div>
  );
}
