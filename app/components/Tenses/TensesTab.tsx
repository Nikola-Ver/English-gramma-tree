import { useEffect, useState } from 'react';
import './Tenses.css';
import { TENSES } from '../../data/tenses';
import { TenseResult } from './TenseResult';
import { TenseTree } from './TenseTree';
import { Timeline } from './Timeline';

interface Props {
  targetTenseKey?: string | null;
}

export function TensesTab({ targetTenseKey }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [directResult, setDirectResult] = useState<string | null>(null);

  useEffect(() => {
    if (targetTenseKey && TENSES[targetTenseKey]) {
      setSelectedKey(targetTenseKey);
      setDirectResult(targetTenseKey);
    }
  }, [targetTenseKey]);

  function handleSelectTense(key: string) {
    setSelectedKey(key);
    setDirectResult(key);
  }

  function handleTreeSelect(key: string) {
    setSelectedKey(key);
  }

  function handleRestart() {
    setSelectedKey(null);
    setDirectResult(null);
  }

  return (
    <div id="pane-tenses" className="tab-pane active">
      <Timeline selectedKey={selectedKey} onSelectTense={handleSelectTense} />

      <div className="tt-intro" style={{ marginTop: '1.25rem' }}>
        <strong>Интерактивное дерево выбора времени.</strong> Отвечай на вопросы — получишь нужное
        время с формулой, примерами и типичными ошибками.
      </div>

      {directResult && TENSES[directResult] ? (
        <TenseResult
          tenseKey={directResult}
          tense={TENSES[directResult]}
          breadcrumbs={[]}
          onRestart={handleRestart}
        />
      ) : (
        <TenseTree onSelectTense={handleTreeSelect} />
      )}

      <div className="tt-section-title" style={{ marginTop: '2rem' }}>
        — или выбери сразу —
      </div>
      <div className="tt-all-grid">
        {Object.entries(TENSES).map(([key, t]) => (
          <div
            key={key}
            className={`tt-card${selectedKey === key ? ' active' : ''}`}
            id={`ttcard-${key}`}
            style={
              selectedKey === key
                ? { borderColor: t.color, background: 'rgba(0,0,0,0.08)' }
                : undefined
            }
            onClick={() => handleSelectTense(key)}
          >
            <div className="tt-card-name" style={{ color: t.color }}>
              {t.name}
            </div>
            <div className="tt-card-formula">{t.formula}</div>
            <div className="tt-card-hint">{t.desc.substring(0, 60)}...</div>
          </div>
        ))}
      </div>
    </div>
  );
}
