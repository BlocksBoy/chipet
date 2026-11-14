import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './state.tsx';
import { WalletProvider } from './wallet.tsx';
import { useRoute } from './router.tsx';
import { Shell } from './components/Shell.tsx';
import { Arena } from './pages/Arena.tsx';
import { BountyPage } from './pages/BountyPage.tsx';
import { Studio } from './pages/Studio.tsx';
import { Library } from './pages/Library.tsx';
import { NewBounty } from './pages/NewBounty.tsx';

function App() {
  const r = useRoute();
  const [a, b] = r.parts;
  let page;
  if (a === 'studio') page = <Studio />;
  else if (a === 'library') page = <Library />;
  else if (a === 'new') page = <NewBounty />;
  else if (a === 'bounty' && b) page = <BountyPage id={Number(b)} />;
  else page = <Arena />;
  return <Shell>{page}</Shell>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider><AppProvider><App /></AppProvider></WalletProvider>
  </StrictMode>,
);
