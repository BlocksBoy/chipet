import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './state.tsx';
import { WalletProvider } from './wallet.tsx';
import { useRoute } from './router.tsx';
import { useLang } from './i18n.ts';
import { Shell } from './components/Shell.tsx';
import { Home } from './pages/Home.tsx';
import { PetPage } from './pages/Pet.tsx';
import { Dex } from './pages/Dex.tsx';
import { Kitties } from './pages/Kitties.tsx';
import { Train } from './pages/Train.tsx';
import { Plaza } from './pages/Plaza.tsx';
import { Neighbors } from './pages/Neighbors.tsx';
import { Arena } from './pages/Arena.tsx';
import { BountyPage } from './pages/BountyPage.tsx';
import { Studio } from './pages/Studio.tsx';
import { Library } from './pages/Library.tsx';
import { NewBounty } from './pages/NewBounty.tsx';
import { Guide } from './pages/Guide.tsx';
import { Shop } from './pages/Shop.tsx';
import { Admin } from './pages/Admin.tsx';
import { AdminCats } from './pages/AdminCats.tsx';

function App() {
  const r = useRoute();
  // 订阅语言：切换后整棵页面树重渲染，没单独订阅的小组件也会拿到新文案
  useLang();
  const [a, b] = r.parts;
  let page;
  if (a === 'admin' && b === 'cats') page = <AdminCats />;
  else if (a === 'admin') page = <Admin />;
  else if (a === 'pet' && b === 's' && r.parts[2]) page = <PetPage share={r.parts[2]} />;
  else if (a === 'pet' && b) page = <PetPage id={Number(b)} />;
  else if (a === 'plaza') page = <Plaza />;
  else if (a === 'neighbors') page = <Neighbors />;
  else if (a === 'dex') page = <Dex />;
  else if (a === 'kitties') page = <Kitties />;
  else if (a === 'train') page = <Train />;
  else if (a === 'guide') page = <Guide />;
  else if (a === 'shop') page = <Shop />;
  else if (a === 'lab' && b === 'studio') page = <Studio />;
  else if (a === 'lab' && b === 'library') page = <Library />;
  else if (a === 'lab' && b === 'new') page = <NewBounty />;
  else if (a === 'lab' && b === 'bounty' && r.parts[2]) page = <BountyPage id={Number(r.parts[2])} />;
  else if (a === 'lab') page = <Arena />;
  else page = <Home />;
  return <Shell>{page}</Shell>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider><AppProvider><App /></AppProvider></WalletProvider>
  </StrictMode>,
);
