// Ossature du studio, aux couleurs du Dashboard : une barre latérale
// (Publicité, Chaîne, En cours, Réglages) et une page par adresse (#/…).
// Les adresses servent aussi de liens depuis le Dashboard :
//   #/pub            → les boutons des applis
//   #/pub/erea       → la campagne d'Erea (préparée au premier clic)
//   #/keurcook       → Keur Cook : Recettes ou Publicité
//   #/recettes, #/chaine, #/encours, #/reglages, #/projet/<id>
// (#/autre, l'ancienne entrée, renvoie vers #/chaine.)
import React, { useEffect, useRef, useState } from 'react';
import { VOICES } from '../shared/catalog.js';
import { api, followJob } from './api.js';
import { ProjectView } from './ProjectView.jsx';
import { BrandCard, FrenchVoicesCard, AppCreate, ChannelCreate } from './App.jsx';
import { appLook, NOT_ADVERTISED } from './apps.js';
import { QueuePanel } from './QueuePanel.jsx';
import { RecipesPage } from './RecipesPage.jsx';
import { PlanningPage } from './PlanningPage.jsx';
import { PlansPage } from './PlansPage.jsx';
import { AdPage } from './AdPage.jsx';
import './clay.css';

// ---------- Adresse (#/…) ----------
function readRoute() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] || 'pub', arg: parts.slice(1).join('/') };
}

export function go(path) {
  window.location.hash = `#/${path}`;
}

function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// ---------- Thème clair / sombre (comme le Dashboard) ----------
const THEME_KEY = 'drama-studio.theme';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'sombre';
    } catch {
      return 'sombre';
    }
  });
  useEffect(() => {
    if (theme === 'clair') {
      document.documentElement.setAttribute('data-theme', 'clair');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // préférence non retenue : sans gravité
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'clair' ? 'sombre' : 'clair'))];
}

// Entrée de la barre latérale à allumer quand un projet est ouvert : les
// campagnes et les recettes (Keur Cook) relèvent de Publicité.
const sectionOfProject = (p) => (p && p.mode === 'chaine' && p.kind !== 'pub' ? 'chaine' : 'pub');

// Keur Cook a deux usages : ses recettes en vidéo, et sa pub.
const KEURCOOK_REPO = 'teiki5320/keurcook';

const NAV = [
  { id: 'pub', icon: '📣', label: 'Publicité', path: 'pub' },
  { id: 'chaine', icon: '🎥', label: 'Chaîne', path: 'chaine' },
  { id: 'planning', icon: '🗓️', label: 'Planning', path: 'planning' },
  { id: 'sep' },
  { id: 'encours', icon: '🏭', label: 'En cours', path: 'encours' },
  { id: 'reglages', icon: '⚙️', label: 'Réglages', path: 'reglages' },
];

function Sidebar({ active, running }) {
  return (
    <aside className="clay-side">
      <div className="clay-logo" title="Studio">🎬</div>
      {NAV.map((n) =>
        n.id === 'sep' ? (
          <div key="sep" className="clay-sep" />
        ) : (
          <a key={n.id} href={`#/${n.path}`} className={`clay-nav${active === n.id ? ' on' : ''}`}>
            <span className="clay-nav-ic">
              {n.icon}
              {n.id === 'encours' && running > 0 && <span className="clay-dot">{running}</span>}
            </span>
            {n.label}
          </a>
        ),
      )}
    </aside>
  );
}

function TopBar({ title, onBack, theme, onTheme }) {
  return (
    <header className="clay-top">
      {onBack && (
        <button className="clay-pill" onClick={onBack} title="Retour">
          ←
        </button>
      )}
      <h1>{title}</h1>
      <button className="clay-pill" onClick={onTheme} title="Thème clair / sombre">
        {theme === 'clair' ? '🌙' : '☀️'}
      </button>
    </header>
  );
}

// Suivi d'un job de création (campagne, atelier…) en plein écran.
function Waiting({ job, error, onBack }) {
  return (
    <div className="clay-wait">
      {!error && <div className="spinner" />}
      <h2>{error ? 'Ça n’a pas marché' : 'Préparation…'}</h2>
      <p className="clay-muted">{error || job?.step || 'Démarrage…'}</p>
      {!error && job?.progress != null && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
        </div>
      )}
      <button className="clay-btn ghost" onClick={onBack}>
        ← Retour
      </button>
    </div>
  );
}

// ---------- Publicité : un bouton par dépôt ----------
function PubPage({ projects, onOpenRepo }) {
  const [repos, setRepos] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api
      .githubRepos()
      .then((d) => setRepos((d.repos || []).filter((r) => !NOT_ADVERTISED.has(r.name.toLowerCase()))))
      .catch((e) => setError(e.message));
  }, []);

  const campaigns = projects.filter((p) => p.kind === 'pub');
  const byRepo = (fullName) =>
    campaigns.find((p) => String(p.repo || '').toLowerCase() === fullName.toLowerCase());
  // Campagnes créées sans dépôt (un site, une fiche tapée à la main).
  const others = campaigns.filter(
    (p) => !p.repo || !(repos || []).some((r) => r.fullName.toLowerCase() === p.repo.toLowerCase()),
  );
  const count = (p) => (p ? (p.episodes || []).length : 0);
  const badge = (n) => (
    <span className={`clay-badge${n ? ' ok' : ''}`}>{n ? `${n} pub${n > 1 ? 's' : ''}` : 'aucune pub'}</span>
  );

  if (showForm) {
    return (
      <div className="clay-content">
        <button className="clay-btn ghost" onClick={() => setShowForm(false)}>
          ← Retour aux applis
        </button>
        <AppCreate
          error={formError}
          voices={VOICES}
          onSubmit={(info) =>
            onOpenRepo(null, () => api.createAdProject(info)).catch((e) => setFormError(e.message))
          }
        />
      </div>
    );
  }

  return (
    <div className="clay-content">
      {error && <p className="error">Liste GitHub illisible : {error}</p>}
      {!repos && !error && <p className="clay-muted">Chargement de tes dépôts…</p>}
      <div className="clay-grid">
        {(repos || []).map((r) => {
          const look = appLook(r.name, r.label);
          const p = byRepo(r.fullName);
          return (
            <button
              key={r.fullName}
              className="clay-tile"
              onClick={() =>
                r.fullName.toLowerCase() === KEURCOOK_REPO ? go('keurcook') : onOpenRepo(r.fullName)
              }
            >
              <span className="clay-tile-ic">{look.icon}</span>
              <b>{look.name}</b>
              {badge(count(p))}
            </button>
          );
        })}
        {others.map((p) => (
          <button key={p.id} className="clay-tile" onClick={() => go(`projet/${p.id}`)}>
            <span className="clay-tile-ic">🌐</span>
            <b>{p.title}</b>
            {badge(count(p))}
          </button>
        ))}
        {repos && (
          <button className="clay-tile add" onClick={() => setShowForm(true)}>
            <span className="clay-tile-ic">➕</span>
            <b>Autre appli ou site</b>
            <span className="clay-muted small">depuis une adresse de site</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Keur Cook : ses recettes en vidéo, ou sa pub ----------
function KeurCookPage({ projects, onOpenRepo }) {
  const recettes = projects.find((p) => p.mode === 'recette');
  const pub = projects.find((p) => p.kind === 'pub' && String(p.repo || '').toLowerCase() === KEURCOOK_REPO);
  const n = (p) => (p ? (p.episodes || []).length : 0);
  return (
    <div className="clay-content">
      <div className="clay-two">
        <a className="clay-big" href="#/recettes">
          <span className="clay-big-ic">🍲</span>
          <b>Recettes</b>
          {n(recettes) ? <span>{`${n(recettes)} vidéo${n(recettes) > 1 ? 's' : ''}`}</span> : null}
        </a>
        <button className="clay-big" onClick={() => onOpenRepo(KEURCOOK_REPO)}>
          <span className="clay-big-ic">📣</span>
          <b>Publicité</b>
          {n(pub) ? <span>{`${n(pub)} pub${n(pub) > 1 ? 's' : ''}`}</span> : null}
        </button>
      </div>
    </div>
  );
}

// ---------- Chaîne : mes chaînes + création ----------
function ChainePage({ projects, onCreate }) {
  const [error, setError] = useState('');
  const channels = projects.filter((p) => p.mode === 'chaine' && p.kind !== 'pub');
  return (
    <div className="clay-content">
      {channels.length > 0 && (
        <>
          <p className="clay-sub">Mes chaînes</p>
          <div className="clay-grid">
            {channels.map((p) => (
              <a key={p.id} className="clay-tile" href={`#/projet/${p.id}`}>
                <span className="clay-tile-ic">🎥</span>
                <b>{p.title}</b>
                <span className="clay-badge ok">
                  {(p.episodes || []).length} vidéo{(p.episodes || []).length > 1 ? 's' : ''}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
      <ChannelCreate
        error={error}
        voices={VOICES}
        onSubmit={(info) => onCreate(() => api.createChannel(info)).catch((e) => setError(e.message))}
      />
    </div>
  );
}

// ---------- Recettes : l'atelier unique, créé au premier passage ----------
function RecettesEntry({ projects, loaded, onCreate }) {
  const started = useRef(false);
  const atelier = projects.find((p) => p.mode === 'recette');
  useEffect(() => {
    if (!loaded || atelier || started.current) {
      return;
    }
    started.current = true;
    onCreate(
      () =>
        api.createRecipeStudio({
          name: 'Recettes Keur Cook',
          tone: 'chaleureux',
          targetSeconds: 60,
          narratorVoice: 'tMyQcCxfGDdIt7wJ2RQw', // Marie Alice (voix française)
        }),
      'recettes',
    );
  }, [loaded, atelier]);
  if (atelier) {
    return <RecipesPage projectId={atelier.id} />;
  }
  return <p className="clay-content clay-muted">⏳ Ouverture de l'atelier de recettes…</p>;
}

// ---------- Réglages : ma marque, voix françaises ----------
// YouTube : coller les clés du projet Google « Studio », puis se connecter.
function YoutubeCard() {
  const [etat, setEtat] = useState(null);
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const load = () => api.youtube().then(setEtat).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  if (!etat) {
    return null;
  }
  return (
    <div className="clay-block">
      <h3>▶️ YouTube</h3>
      {etat.connecte ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="clay-state ok">Connecté{etat.chaine ? ` — ${etat.chaine}` : ''}</span>
          <a className="clay-btn ghost small" href="/api/youtube/connecter">
            Reconnecter
          </a>
          <button className="clay-btn ghost small" onClick={() => api.youtubeDeconnecter().then(setEtat)}>
            Déconnecter
          </button>
        </div>
      ) : etat.configure ? (
        <a className="clay-btn" href="/api/youtube/connecter">
          Connecter YouTube
        </a>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          <input className="rp-input" placeholder="ID client (…apps.googleusercontent.com)" value={id} onChange={(e) => setId(e.target.value)} />
          <input className="rp-input" type="password" placeholder="Code secret du client" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button
            className="clay-btn"
            onClick={() =>
              api
                .youtubeCles(id, secret)
                .then((e) => {
                  setEtat(e);
                  setId('');
                  setSecret('');
                  setError('');
                })
                .catch((e) => setError(e.message))
            }
          >
            Enregistrer les clés
          </button>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

function ReglagesPage() {
  const [studio, setStudio] = useState(null);
  const [voices, setVoices] = useState(VOICES);
  const refreshStudio = () => api.getStudio().then(setStudio).catch(() => {});
  const refreshVoices = () => api.voices().then(setVoices).catch(() => {});
  useEffect(() => {
    refreshStudio();
    refreshVoices();
  }, []);
  return (
    <div className="clay-content">
      <YoutubeCard />
      <BrandCard studio={studio} onChange={refreshStudio} />
      <FrenchVoicesCard voices={voices} onChange={refreshVoices} />
    </div>
  );
}

// ---------- En cours : la file et les fabrications ----------
function EnCoursPage() {
  return (
    <div className="clay-content">
      <QueuePanel />
    </div>
  );
}

const TITLES = {
  pub: 'Publicité',
  keurcook: '🍲 Keur Cook',
  recettes: '🍲 Recettes Keur Cook',
  chaine: 'Chaîne',
  encours: 'En cours',
  reglages: 'Réglages',
  planning: 'Planning',
};

export function Shell() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(0);
  const [waiting, setWaiting] = useState(null); // { job, error }

  const refresh = () =>
    api
      .listProjects()
      .then((list) => {
        setProjects(list);
        setLoaded(true);
        return list;
      })
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, [route.page]);

  const project =
    route.page === 'projet' || route.page === 'avance' ? projects.find((p) => p.id === route.arg) : null;

  // Pastille « En cours » : tout ce qui se fabrique ou attend — la file
  // (en cours + en attente) et les retouches lancées à part.
  useEffect(() => {
    const tick = () =>
      Promise.all([api.queue(), api.activeJobs()])
        .then(([file, jobs]) => {
          const enFile = file.filter((it) => it.status === 'running' || it.status === 'waiting');
          const lies = new Set(file.map((it) => it.jobId).filter(Boolean));
          setRunning(enFile.length + jobs.filter((j) => !lies.has(j.id)).length);
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, []);

  // Lance un job de création, le suit, puis ouvre le projet obtenu.
  const runCreation = async (kickoff, destination = null) => {
    setWaiting({ job: null, error: null });
    try {
      const r = await kickoff();
      const projectId = r.projectId || (await followJob(r.jobId, (job) => setWaiting({ job, error: null }))).result?.projectId;
      await refresh();
      setWaiting(null);
      go(destination || `projet/${projectId}`);
    } catch (e) {
      setWaiting({ job: null, error: e.message });
    }
  };

  // #/pub/<dépôt> : ouvre (ou prépare) la campagne de ce dépôt.
  const openRepo = (fullName, kickoff = null) =>
    runCreation(kickoff || (() => api.adFromRepo(fullName)));

  // Ancienne adresse « Autre » (liens déjà enregistrés) → Chaîne ; un
  // atelier de recettes s'ouvre toujours sur la page Recettes.
  useEffect(() => {
    if (route.page === 'autre') {
      window.location.replace('#/chaine');
    }
    if (route.page === 'projet' && project && project.mode === 'recette') {
      window.location.replace('#/recettes');
    }
  }, [route.page, project]);

  useEffect(() => {
    if (route.page === 'pub' && route.arg) {
      const full = route.arg.includes('/') ? route.arg : `teiki5320/${route.arg}`;
      openRepo(full);
    }
  }, [route.page, route.arg]);

  const active =
    route.page === 'projet' || route.page === 'avance'
      ? sectionOfProject(project)
      : ['recettes', 'keurcook'].includes(route.page)
        ? 'pub'
        : route.page;

  let body;
  if (waiting) {
    body = (
      <>
        <TopBar title="Préparation" theme={theme} onTheme={toggleTheme} />
        <Waiting
          job={waiting.job}
          error={waiting.error}
          onBack={() => {
            setWaiting(null);
            go(active === 'chaine' ? 'chaine' : 'pub');
          }}
        />
      </>
    );
  } else if (route.page === 'avance' && project && (project.mode === 'chaine' || project.mode === 'recette')) {
    // Retoucher une pub, une vidéo de chaîne ou une recette, plan par plan.
    body = (
      <>
        <TopBar
          title={`🔧 ${project.title}`}
          onBack={() => go(project.mode === 'recette' ? 'recettes' : `projet/${route.arg}`)}
          theme={theme}
          onTheme={toggleTheme}
        />
        <PlansPage key={route.arg} projectId={route.arg} />
      </>
    );
  } else if ((route.page === 'projet' || route.page === 'avance') && project && project.mode !== 'chaine') {
    // Ancien drama (ou projet inconnu) : l'ancienne page de production.
    body = <ProjectView key={route.arg} projectId={route.arg} onBack={() => go('pub')} />;
  } else if (route.page === 'avance') {
    // Réglages avancés d'une pub ou d'une chaîne : scènes, voix, images une par une.
    body = <ProjectView key={route.arg} projectId={route.arg} onBack={() => go(`projet/${route.arg}`)} />;
  } else if (route.page === 'projet') {
    const backTo = !project
      ? 'pub'
      : String(project.repo || '').toLowerCase() === KEURCOOK_REPO
        ? 'keurcook'
        : sectionOfProject(project);
    const look = project && project.kind === 'pub' ? appLook(String(project.repo || '').split('/')[1] || '', project.title) : null;
    body = (
      <>
        <TopBar
          title={project ? (look ? `${look.icon} ${project.title}` : `🎥 ${project.title}`) : 'Chargement…'}
          onBack={() => go(backTo)}
          theme={theme}
          onTheme={toggleTheme}
        />
        <AdPage key={route.arg} projectId={route.arg} onAdvanced={() => go(`avance/${route.arg}`)} />
      </>
    );
  } else {
    const back = route.page === 'recettes' || route.page === 'keurcook' ? () => go(route.page === 'recettes' ? 'keurcook' : 'pub') : null;
    body = (
      <>
        <TopBar title={TITLES[route.page] || 'Publicité'} onBack={back} theme={theme} onTheme={toggleTheme} />
        {route.page === 'keurcook' ? (
          <KeurCookPage projects={projects} onOpenRepo={openRepo} />
        ) : route.page === 'recettes' ? (
          <RecettesEntry projects={projects} loaded={loaded} onCreate={runCreation} />
        ) : route.page === 'chaine' ? (
          <ChainePage projects={projects} onCreate={runCreation} />
        ) : route.page === 'planning' ? (
          <PlanningPage />
        ) : route.page === 'encours' ? (
          <EnCoursPage />
        ) : route.page === 'reglages' ? (
          <ReglagesPage />
        ) : (
          <PubPage projects={projects} onOpenRepo={openRepo} />
        )}
      </>
    );
  }

  return (
    <div className="clay-shell">
      <Sidebar active={active} running={running} />
      <main className="clay-main">{body}</main>
    </div>
  );
}
