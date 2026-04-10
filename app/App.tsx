import { useState } from 'react';
import './styles/base.css';
import { GrammarTab } from './components/Grammar/GrammarTab';
import { Header } from './components/Header/Header';
import { MurphyTab } from './components/Murphy/MurphyTab';
import { Tabs } from './components/Tabs';
import { TensesTab } from './components/Tenses/TensesTab';
import { useProgress } from './hooks/useProgress';

type Tab = 'grammar' | 'murphy' | 'tenses';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grammar');
  const [searchQuery, setSearchQuery] = useState('');
  const grammarProgress = useProgress('eng_v4');
  const murphyProgress = useProgress('murphy_v1');

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
        />
      )}
      {activeTab === 'murphy' && (
        <MurphyTab
          done={murphyProgress.done}
          onToggleRule={murphyProgress.toggleRule}
          onReset={murphyProgress.resetAll}
          searchQuery={searchQuery}
        />
      )}
      {activeTab === 'tenses' && <TensesTab />}
    </div>
  );
}
