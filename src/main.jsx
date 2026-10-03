import React from 'react';
import { createRoot } from 'react-dom/client';
// styles.css d'abord : le thème Clay (importé par Shell.jsx) passe après
// et remappe ses couleurs.
import './styles.css';
import { Shell } from './Shell.jsx';

createRoot(document.getElementById('root')).render(<Shell />);
