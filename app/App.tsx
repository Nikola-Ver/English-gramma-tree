import { useEffect, useState } from 'react';
import './styles/base.css';
import { AccountPage } from './components/Account/AccountPage';
import { AuthPage } from './components/Auth/AuthPage';
import { GrammarTab } from './components/Grammar/GrammarTab';
import { Header } from './components/Header/Header';
import { MurphyTab } from './components/Murphy/MurphyTab';
import { Tabs } from './components/Tabs';
import { TensesTab } from './components/Tenses/TensesTab';
import { AuthSyncProvider, useAuthSync } from './context/AuthSyncContext';
import { DATA } from './data/grammar';
import { MURPHY_DATA } from './data/murphy';
import { useProgress } from './hooks/useProgress';
import { useTheme } from './hooks/useTheme';
import { parseRuleHash, parseTenseHash } from './utils/deepLink';

type Tab = 'grammar' | 'murphy' | 'tenses';
type View = 'main' | 'auth' | 'account';

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

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('grammar');
  const [view, setView] = useState<View>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetRuleId, setTargetRuleId] = useState<string | null>(null);
  const [targetTenseKey, setTargetTenseKey] = useState<string | null>(null);
  const grammarProgress = useProgress('eng_v4');
  const murphyProgress = useProgress('murphy_v1');
  const { theme, toggleTheme } = useTheme();
  const { user, authLoading } = useAuthSync();

  // Redirect to main whenever auth state settles (sign-in or sign-out)
  useEffect(() => {
    if (!authLoading) setView('main');
  }, [user, authLoading]);

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

  function handleTabSwitch(tab: Tab) {
    if (tab !== activeTab) {
      history.replaceState(null, '', location.pathname + location.search);
      setTargetRuleId(null);
      setTargetTenseKey(null);
    }
    setActiveTab(tab);
  }

  function handleAvatarClick() {
    setView(user ? 'account' : 'auth');
  }

  function handleBackToMain() {
    setView('main');
  }

  return (
    <div className="wrap">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={view === 'main' && (activeTab === 'grammar' || activeTab === 'murphy')}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAvatarClick={handleAvatarClick}
        onTitleClick={handleBackToMain}
      />

      {view === 'auth' && <AuthPage onContinueWithout={handleBackToMain} />}

      {view === 'account' && <AccountPage onBack={handleBackToMain} />}

      {view === 'main' && (
        <>
          <Tabs activeTab={activeTab} onSwitch={handleTabSwitch} />
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
        </>
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthSyncProvider>
      <AppContent />
    </AuthSyncProvider>
  );
}
