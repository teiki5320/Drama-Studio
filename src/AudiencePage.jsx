// Audience des sites, lue chez Cloudflare : une période, un site (ou tous),
// la courbe des visiteurs jour par jour, puis les pages, pays et sources.
// Le tableau des sites se trie en touchant le titre d'une colonne.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const PERIODES = [
  [7, '7 jours'],
  [30, '30 jours'],
  [90, '3 mois'],
];
const nb = (n) => Number(n || 0).toLocaleString('fr-FR');
const somme = (l, k) => l.reduce((t, x) => t + (x[k] || 0), 0);

// Les jours de deux sites ou plus, additionnés date par date.
function cumul(sites) {
  const m = new Map();
  for (const s of sites) {
    for (const j of s.jours) {
      const x = m.get(j.date) || { date: j.date, visiteurs: 0, vues: 0 };
      x.visiteurs += j.visiteurs || 0;
      x.vues += j.vues || 0;
      m.set(j.date, x);
    }
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Additionne des listes { nom, vues } (pays, sources) de plusieurs sites.
function fusion(listes) {
  const m = new Map();
  for (const l of listes) {
    for (const x of l) {
      m.set(x.nom, (m.get(x.nom) || 0) + x.vues);
    }
  }
  return [...m.entries()]
    .map(([nom, vues]) => ({ nom, vues }))
    .sort((a, b) => b.vues - a.vues)
    .slice(0, 10);
}

function Courbe({ jours, h = 180 }) {
  const [survol, setSurvol] = useState(null);
  if (!jours.length) {
    return <p className="clay-muted small">Pas encore de données sur cette période.</p>;
  }
  const W = 800;
  const max = Math.max(1, ...jours.map((j) => j.visiteurs));
  const x = (i) => (jours.length === 1 ? W / 2 : (i * W) / (jours.length - 1));
  const y = (v) => h - 8 - ((h - 24) * v) / max;
  const ligne = jours.map((j, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(j.visiteurs).toFixed(1)}`).join(' ');
  const s = survol === null ? null : jours[survol];
  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${h}`}
        style={{ width: '100%', height: h, display: 'block' }}
        preserveAspectRatio="none"
        onMouseLeave={() => setSurvol(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setSurvol(Math.max(0, Math.min(jours.length - 1, Math.round(((e.clientX - r.left) / r.width) * (jours.length - 1)))));
        }}
      >
        <path d={`${ligne} L${x(jours.length - 1)},${h} L${x(0)},${h} Z`} fill="var(--accent)" opacity="0.15" />
        <path d={ligne} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {s ? <line x1={x(survol)} x2={x(survol)} y1="0" y2={h} stroke="var(--c-muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="clay-muted small" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span>{jours[0].date.split('-').reverse().slice(0, 2).join('/')}</span>
        <span>{s ? `${s.date.split('-').reverse().slice(0, 2).join('/')} : ${nb(s.visiteurs)} visiteurs · ${nb(s.vues)} pages vues` : `max ${nb(max)} visiteurs / jour`}</span>
        <span>{jours[jours.length - 1].date.split('-').reverse().slice(0, 2).join('/')}</span>
      </div>
    </div>
  );
}

function Liste({ titre, lignes, vide, note }) {
  const max = Math.max(1, ...lignes.map((l) => l.vues));
  return (
    <div className="clay-block" style={{ minWidth: 0 }}>
      <h3 style={{ marginTop: 0, marginBottom: note ? 4 : undefined }}>{titre}</h3>
      {note ? <p className="clay-muted small" style={{ marginTop: 0 }}>{note}</p> : null}
      {lignes.length === 0 ? <p className="clay-muted small">{vide}</p> : null}
      {lignes.map((l) => (
        <div key={l.nom} style={{ position: 'relative', padding: '5px 8px', marginBottom: 4, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${(100 * l.vues) / max}%`, background: 'var(--none-tint)' }} />
          <div style={{ position: 'relative', display: 'flex', gap: 8, fontSize: 13 }}>
            <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{l.nom}</span>
            <b>{nb(l.vues)}</b>
          </div>
        </div>
      ))}
    </div>
  );
}

function CleCloudflare({ onOk }) {
  const [cle, setCle] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="clay-block" style={{ maxWidth: 640 }}>
      <h3 style={{ marginTop: 0 }}>📈 Brancher Cloudflare</h3>
      <ol className="small" style={{ lineHeight: 1.6, paddingLeft: 18 }}>
        <li>dash.cloudflare.com → icône 👤 en haut à droite → Profil → Jetons d'API → Créer un jeton.</li>
        <li>Modèle « Lire les rapports d'analyse et les journaux » (Read analytics and logs) → Utiliser le modèle.</li>
        <li>Ressources de zone : toutes les zones · Ressources du compte : ton compte → Continuer → Créer le jeton.</li>
        <li>Copie le jeton et colle-le ici.</li>
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="rp-input" style={{ flex: 1, minWidth: 220 }} type="password" placeholder="Jeton Cloudflare (lecture seule)" value={cle} onChange={(e) => setCle(e.target.value)} />
        <button
          className="clay-btn"
          onClick={() =>
            api
              .cloudflareCle(cle)
              .then(onOk)
              .catch((e) => setError(e.message))
          }
        >
          Enregistrer
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

export function AudiencePage() {
  const [jours, setJours] = useState(30);
  const [data, setData] = useState(null);
  const [site, setSite] = useState('tous');
  const [tri, setTri] = useState(['visiteurs', -1]);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    return api
      .audience(jours)
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, [jours]);

  if (!data) {
    return <div className="clay-content clay-muted">{error || 'Chargement de l’audience…'}</div>;
  }
  if (!data.configure) {
    return (
      <div className="clay-content">
        <CleCloudflare onOk={load} />
      </div>
    );
  }

  const lignes = data.sites.map((s) => ({
    nom: s.nom,
    source: s.source,
    visiteurs: somme(s.jours, 'visiteurs'),
    vues: somme(s.jours, 'vues'),
  }));
  const [col, sens] = tri;
  lignes.sort((a, b) => (typeof a[col] === 'string' ? a[col].localeCompare(b[col]) : a[col] - b[col]) * sens);
  const choisis = site === 'tous' ? data.sites : data.sites.filter((s) => s.nom === site);
  const parJour = cumul(choisis);
  const entete = (k, nom) => (
    <th style={{ padding: '6px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setTri([k, col === k ? -sens : -1])}>
      {nom} {col === k ? (sens < 0 ? '↓' : '↑') : ''}
    </th>
  );

  return (
    <div className="clay-content">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODES.map(([n, nom]) => (
          <button key={n} className={`clay-btn small${jours === n ? '' : ' ghost'}`} onClick={() => setJours(n)}>
            {nom}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <select className="rp-input" style={{ width: 'auto' }} value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="tous">Tous les sites</option>
          {data.sites.map((s) => (
            <option key={s.nom} value={s.nom}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="clay-block">
        <h3 style={{ marginTop: 0 }}>
          {site === 'tous' ? 'Tous les sites' : site} · {nb(somme(parJour, 'visiteurs'))} visiteurs · {nb(somme(parJour, 'vues'))} pages vues
        </h3>
        <Courbe jours={parJour} />
      </div>

      <div className="clay-block" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr className="clay-muted small" style={{ textAlign: 'left' }}>
              {entete('nom', 'Site')}
              {entete('visiteurs', 'Visiteurs')}
              {entete('vues', 'Pages vues')}
              {entete('source', 'Mesure')}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr
                key={l.nom}
                onClick={() => setSite(site === l.nom ? 'tous' : l.nom)}
                style={{ borderTop: '1px solid var(--ligne)', cursor: 'pointer', background: site === l.nom ? 'var(--none-tint)' : 'transparent' }}
              >
                <td style={{ padding: 8, fontWeight: 700 }}>{l.nom}</td>
                <td style={{ padding: 8 }}>{nb(l.visiteurs)}</td>
                <td style={{ padding: 8 }}>{l.source === 'Domaine' && !l.vues ? '—' : nb(l.vues)}</td>
                <td style={{ padding: 8 }} className="clay-muted small">
                  {l.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Liste
          titre="📄 Pages les plus vues"
          vide="Visible avec la mesure Web Analytics."
          lignes={fusion(choisis.map((s) => (site === 'tous' ? s.pages.map((p) => ({ ...p, nom: `${s.nom}${p.nom}` })) : s.pages)))}
        />
        <Liste
          titre="🌍 Pays"
          vide="Pas de données."
          note={choisis.some((s) => s.source === 'Domaine') ? 'Fichiers chargés depuis chaque pays (pages, images, robots compris) : pas des visiteurs.' : null}
          lignes={fusion(choisis.map((s) => s.pays))}
        />
        <Liste titre="🔗 D’où ils viennent" vide="Visible avec la mesure Web Analytics." lignes={fusion(choisis.map((s) => s.sources))} />
      </div>
      {(data.erreurs || []).length > 0 && <p className="clay-muted small">⚠️ {data.erreurs.join(' · ')}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
