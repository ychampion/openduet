import './sample/mode.ts';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/newsreader/opsz.css';
import './design/tokens.css';
import './design/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './experience/push.ts';
import { installDiagnostics } from './feedback/diagnostics.ts';
import { sampleMode } from './sample/mode.ts';
import { SampleDay } from './sample/SampleDay.tsx';

installDiagnostics();

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

if (!sampleMode) registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <SampleDay>
      <App />
    </SampleDay>
  </StrictMode>,
);
