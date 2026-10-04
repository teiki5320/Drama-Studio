// Page Recettes : la vidéo à gauche, les commandes à droite.
// On choisit une recette du site, « Générer », et la vidéo explicative se
// fabrique toute seule jusqu'au MP4 (script, images, voix, réparation,
// montage) — via la file d'attente, sans écran de script.
import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { VideoSave, lienVideo } from './VideoSave.jsx';
import { api } from './api.js';
import { Recipe, recipeDurationInFrames } from './remotion/Recipe.jsx';
import { FPS, WIDTH, HEIGHT } from './remotion/timing.js';

const fr = (n) => Number(n).toLocaleString('fr-FR');

export function Credits() {
  const [c, setC] = useState(null);
  useEffect(() => {
    api.credits().then(setC).catch(() => setC({}));
  }, []);
  const oa = c?.openart?.credits;
  const el = c?.elevenlabs;
  const elRest = el && el.limit != null ? Math.max(0, el.limit - el.used) : null;
  return (
    <div className="rp-credits">
      <span className="rp-credit">
        🎨 OpenArt <b>{oa != null ? fr(oa) : '…'}</b>
      </span>
      <span className="rp-credit">
        🎙️ ElevenLabs <b>{elRest != null ? fr(elRest) : '—'}</b>
      </span>
      <span className="rp-credit">
        🤖 Claude <b>inclus</b>
      </span>
    </div>
  );
}

// Aperçu : le MP4 monté s'il existe, sinon l'aperçu Remotion de la vidéo.
function Apercu({ project, episode }) {
  if (!episode) {
    return (
      <div className="rp-video rp-video-vide">
        <span>🍲</span>
        <p>Choisis une recette à droite, puis « Générer ».</p>
      </div>
    );
  }
  if (episode.renderedFile) {
    return (
      <video
        key={episode.renderedFile}
        className="rp-video"
        src={`/files/${project.id}/${episode.renderedFile}?v=${encodeURIComponent(project.updatedAt || '')}#t=0.5`}
        preload="metadata"
        controls
        playsInline
      />
    );
  }
  const studio = { outro: null };
  return (
    <div className="rp-video">
      <Player
        component={Recipe}
        inputProps={{ episode, assetBase: `/files/${project.id}`, musicFile: project.musicFile, studio, studioBase: '/studio' }}
        durationInFrames={Math.max(1, recipeDurationInFrames(episode, studio))}
        fps={FPS}
        compositionWidth={WIDTH}
        compositionHeight={HEIGHT}
        controls
        acknowledgeRemotionLicense
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

export function RecipesPage({ projectId }) {
  const [project, setProject] = useState(null);
  const [recipes, setRecipes] = useState(null);
  const [recipesError, setRecipesError] = useState('');
  const [search, setSearch] = useState('');
  const [slug, setSlug] = useState('');
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null); // numéro de la vidéo affichée
  const [error, setError] = useState('');

  const loadProject = () =>
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p);
        return p;
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadProject();
    api
      .recipes()
      .then((r) => {
        setRecipes(r.recipes || []);
        if ((r.recipes || []).length) {
          setSlug(r.recipes[0].slug);
        }
      })
      .catch((e) => setRecipesError(e.message));
  }, [projectId]);

  // Suivi de la fabrication (file d'attente) ; la page se met à jour quand
  // une vidéo se termine.
  useEffect(() => {
    let prevRunning = null;
    const tick = () =>
      api
        .queue()
        .then((list) => {
          const mine = list.filter((it) => it.projectId === projectId);
          setQueue(mine);
          const running = mine.filter((it) => it.status === 'running').map((it) => it.id).join(',');
          if (prevRunning !== null && running !== prevRunning) {
            loadProject();
          }
          prevRunning = running;
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [projectId]);

  const filtered = useMemo(
    () => (recipes || []).filter((r) => r.label.toLowerCase().includes(search.trim().toLowerCase())),
    [recipes, search],
  );

  const episodes = [...(project?.episodes || [])].sort((a, b) => b.number - a.number);
  const shown = episodes.find((e) => e.number === selected) || episodes.find((e) => e.renderedFile) || episodes[0] || null;
  const active = queue.filter((it) => it.status === 'running' || it.status === 'waiting');
  const failed = queue.filter((it) => it.status === 'error').slice(-1)[0];

  const generate = () => {
    const r = (recipes || []).find((x) => x.slug === slug);
    setError('');
    api
      .addToQueue({ kind: 'recette', projectId, slug, seconds: 60, label: r ? r.label : slug })
      .then(() => api.queue())
      .then((list) => setQueue(list.filter((it) => it.projectId === projectId)))
      .catch((e) => setError(e.message));
  };

  const remove = (ep) => {
    if (!confirm(`Supprimer la vidéo « ${ep.title} » (images, voix et MP4) ?`)) {
      return;
    }
    api
      .deleteEpisode(projectId, ep.number)
      .then(() => {
        setSelected(null);
        loadProject();
      })
      .catch((e) => alert(e.message));
  };

  if (!project) {
    return <div className="clay-content clay-muted">{error || 'Chargement de l’atelier…'}</div>;
  }

  return (
    <div className="rp">
      <div className="rp-left">
        <Apercu project={project} episode={shown} />
        {shown && (
          <div className="rp-video-title">
            <b>{shown.title}</b>
            {shown.recipe?.country ? <span className="clay-muted"> · {shown.recipe.country}</span> : null}
          </div>
        )}
      </div>

      <div className="rp-right">
        <div className="clay-block">
          <h3>💰 Crédits restants</h3>
          <Credits />
        </div>

        <div className="clay-block">
          <h3>🍲 Nouvelle vidéo de recette</h3>
          {recipesError && <p className="error small">Recettes du site illisibles : {recipesError}</p>}
          <input
            className="rp-input"
            value={search}
            placeholder="Chercher : ndolé, yassa, mafé…"
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="rp-input" value={slug} disabled={!recipes} onChange={(e) => setSlug(e.target.value)}>
            {!recipes && <option>Chargement des recettes…</option>}
            {filtered.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="clay-btn rp-generate" disabled={!slug} onClick={generate}>
            🎬 Générer la vidéo
          </button>
          <p className="clay-muted small">
            Environ 1 minute : la photo du site, les ingrédients, les étapes avec leurs quantités, le
            plat fini. Tout se fabrique tout seul jusqu'au MP4 rangé dans iCloud.
          </p>
          {error && <p className="error small">{error}</p>}
        </div>

        {(active.length > 0 || failed) && (
          <div className="clay-block">
            <h3>🏭 Fabrication</h3>
            {active.map((it) => (
              <div key={it.id} className="rp-job">
                <div className="rp-job-head">
                  <span>{it.label}</span>
                  <span className={`clay-state ${it.status === 'running' ? 'run' : 'att'}`}>
                    {it.status === 'running' ? 'en cours' : 'en attente'}
                  </span>
                </div>
                {it.status === 'running' && (
                  <>
                    <small className="clay-muted">{it.step || 'Démarrage…'}</small>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.round((it.progress || 0) * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            ))}
            {failed && active.length === 0 && (
              <p className="error small">
                La dernière vidéo ({failed.label}) a échoué : {failed.error}
              </p>
            )}
          </div>
        )}

        <div className="clay-block">
          <h3>🎞️ Mes vidéos de recettes</h3>
          {episodes.length === 0 && <p className="clay-muted small">Aucune vidéo pour l'instant.</p>}
          {episodes.map((ep) => (
            <div
              key={ep.number}
              className={`rp-ep${shown && shown.number === ep.number ? ' on' : ''}`}
              onClick={() => setSelected(ep.number)}
            >
              <span className="rp-ep-title">{ep.title}</span>
              <span className={`clay-state ${ep.renderedFile ? 'ok' : 'att'}`}>
                {ep.renderedFile ? 'MP4 prêt' : 'à monter'}
              </span>
              {ep.renderedFile && (
                <a
                  className="clay-btn ghost small"
                  href={lienVideo(project.id, ep.renderedFile, ep.title)}
                  title="Enregistrer le MP4"
                  onClick={(e) => e.stopPropagation()}
                >
                  ⬇️
                </a>
              )}
              <button
                className="clay-btn ghost small"
                title="Supprimer cette vidéo"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(ep);
                }}
              >
                🗑️
              </button>
            </div>
          ))}
          <VideoSave
            project={project}
            episode={shown && shown.renderedFile ? shown : episodes.find((e) => e.renderedFile)}
            style={{ marginTop: 10 }}
          />
        </div>
      </div>
    </div>
  );
}
