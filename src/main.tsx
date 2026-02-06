import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // 关键：必须引入这个文件
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
