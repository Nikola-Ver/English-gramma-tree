import { useEffect, useState } from 'react';
import './styles/base.css';
import { GrammarTab } from './components/Grammar/GrammarTab';
import { Header } from './components/Header/Header';
import { MurphyTab } from './components/Murphy/MurphyTab';
import { Tabs } from './components/Tabs';
import { TensesTab } from './components/Tenses/TensesTab';
import { DATA } from './data/grammar';
import { MURPHY_DATA } from './data/murphy';
import { useProgress } from './hooks/useProgress';
import { parseRuleHash, parseTenseHash } from './utils/deepLink';

type Tab = 'grammar' | 'murphy' | 'tenses';

function findRuleTab(ruleId: string): Tab | null {
  for (const lvl of DATA) {
    for (const cat of lvl.categories) {
      if (cat.rules.some((r) => r.id === ruleId)) return 'grammar';
    }
  }
  for (const lvl of MURPHY_DATA) {
    for (const cat of lvl.categories) {
      if (cat.rules.some((r) => r.id === ruleId)) return 'murphy';
    }
  }
  return null;
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grammar');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetRuleId, setTargetRuleId] = useState<string | null>(null);
  const [targetTenseKey, setTargetTenseKey] = useState<string | null>(null);
  const grammarProgress = useProgress('eng_v4');
  const murphyProgress = useProgress('murphy_v1');

  useEffect(() => {
    const parsedRule = parseRuleHash();
    if (parsedRule) {
      const tab = findRuleTab(parsedRule.ruleId);
      if (tab) {
        setActiveTab(tab);
        setTargetRuleId(parsedRule.ruleId);
      }
      return;
    }
    const parsedTense = parseTenseHash();
    if (parsedTense) {
      setActiveTab('tenses');
      setTargetTenseKey(parsedTense.tenseKey);
    }
  }, []);

  return (
    <div className="wrap">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <Tabs activeTab={activeTab} onSwitch={setActiveTab} />
      {activeTab === 'grammar' && (
        <GrammarTab
          done={grammarProgress.done}
          onToggleRule={grammarProgress.toggleRule}
          onReset={grammarProgress.resetAll}
          searchQuery={searchQuery}
          targetRuleId={targetRuleId}
        />
      )}
      {activeTab === 'murphy' && (
        <MurphyTab
          done={murphyProgress.done}
          onToggleRule={murphyProgress.toggleRule}
          onReset={murphyProgress.resetAll}
          searchQuery={searchQuery}
          targetRuleId={targetRuleId}
        />
      )}
      {activeTab === 'tenses' && <TensesTab targetTenseKey={targetTenseKey} />}
    </div>
  );
}
