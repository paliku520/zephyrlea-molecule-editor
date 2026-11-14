import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LogsWindow } from './components/LogsWindow';
import { installConsoleLogForwarding } from './lib/consoleLogs';
import { applyThemeToDocument, loadSettings } from './lib/settings';
import './index.css';

applyThemeToDocument(loadSettings().theme);
installConsoleLogForwarding();

// The system log console is the same bundle opened as `?window=logs`.
const isLogsWindow = new URLSearchParams(window.location.search).get('window') === 'logs';
if (isLogsWindow) document.title = 'Zephyrlea · 系统日志';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isLogsWindow ? <LogsWindow /> : <App />}</StrictMode>,
);
