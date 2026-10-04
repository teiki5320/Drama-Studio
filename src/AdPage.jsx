// Page d'une campagne de pub (une appli) ou d'une chaîne, sur le modèle de la
// page Recettes : la vidéo à gauche, les commandes à droite. On choisit une
// idée (ou on écrit la sienne), « Générer », et la vidéo se fabrique toute
// seule jusqu'au MP4 (file d'attente). Les réglages fins restent accessibles
// par « Réglages avancés » (l'ancienne page de production).
//
// La façon d'écrire chaque pub est encore la même pour toutes les applis :
// elle sera personnalisée appli par appli, avec Jean.
import React, { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { api, followJob } from './api.js';
import { Episode } from './remotion/Episode.jsx';
import { FPS, WIDTH, HEIGHT, episodeDurationInFrames } from './remotion/timing.js';
import { Credits } from './RecipesPage.jsx';
import { ScreenshotsPanel } from './ProjectView.jsx';

function Apercu({ project, episode, studio }) {
  const isPub = project.kind === 'pub';
  if (!episode) {
    return (
      <div className="rp-video rp-video-vide">
        <span>{isPub ? '📣' : '🎥'}</span>
        <p>{isPub ? 'Choisis une idée à droite, puis « Générer la pub ».' : 'Choisis un sujet à droite, puis « Générer la vidéo ».'}</p>
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
  const cta = isPub ? episode.cta || project.cta || '' : '';
  const ctaLogo = isPub && project.ctaLogo ? `/files/${project.id}/${project.ctaLogo}` : '';
  return (
    <div className="rp-video">
      <Player
        component={Episode}
        inputProps={{
          episode,
          characters: project.characters,
          assetBase: `/files/${project.id}`,
          musicFile: project.musicFile,
          seriesTitle: project.title,
          studio,
          studioBase: '/studio',
          noOutroCard: true,
          cta,
          ctaLogo,
          ctaTheme: project.ctaTheme,
        }}
        durationInFrames={Math.max(1, episodeDurationInFrames(episode, studio, true, cta))}
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

// Keur Cook : pas d'idées à choisir — la pub suit la tournée des pays
// (plat emblématique + ingrédient rare), la fin alterne recette / ingrédient.
function KeurCookAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [pays, setPays] = useState('');
  const [seconds, setSeconds] = useState(45);
  const [error, setError] = useState('');
  const load = () =>
    api
      .keurcookPlan(projectId)
      .then((p) => {
        setPlan(p);
        setPays((cur) => cur || (p.next && p.next.pays) || '');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const choisi = plan?.pays.find((e) => e.pays === pays);
  return (
    <div className="clay-block">
      <h3>🌍 Nouvelle pub — Tour d'Afrique</h3>
      {!plan && !error && <p className="clay-muted small">Chargement de la tournée…</p>}
      {plan && (
        <>
          <select className="rp-input" value={pays} onChange={(e) => setPays(e.target.value)}>
            {plan.pays.map((e) => (
              <option key={e.pays} value={e.pays}>
                {e.fait ? '✓ ' : ''}
                {e.pays} — {e.recette} + {e.produit}
                {plan.next && e.pays === plan.next.pays ? ' (prochain)' : ''}
              </option>
            ))}
          </select>
          {choisi && (
            <p className="clay-muted small">
              Plat : <b>{choisi.recette}</b> · ingrédient secret : <b>{choisi.produit}</b> · fin :{' '}
              <b>{plan.fin === 'produit' ? "l'ingrédient sur keurcook.com" : 'la recette sur keurcook.com'}</b>
            </p>
          )}
          <select className="rp-input" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            <option value={45}>45 secondes</option>
            <option value={60}>60 secondes</option>
          </select>
          <button
            className="clay-btn rp-generate"
            disabled={!pays}
            onClick={() =>
              api
                .addToQueue({ kind: 'keurcook', projectId, pays, seconds })
                .then(() => {
                  setPays('');
                  onQueued();
                  return load();
                })
                .catch((e) => setError(e.message))
            }
          >
            🎬 Générer la pub
          </button>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

// Keur Déco : trois formats au choix (ambiance, visite, avant / après),
// l'article du site (le prochain est proposé), la vue pour l'ambiance.
function KeurDecoAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [format, setFormat] = useState('ambiance');
  const [article, setArticle] = useState('');
  const [vue, setVue] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState('');
  const load = () =>
    api
      .keurdecoPlan(projectId)
      .then((p) => {
        setPlan(p);
        setArticle((cur) => cur || p.next || '');
        setVue((cur) => cur || p.nextVue || '');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const choix = (plan?.articles || []).filter((a) => format === 'ambiance' || a.objets >= 2);
  return (
    <div className="clay-block">
      <h3>🛋️ Nouvelle pub Keur Déco</h3>
      {!plan && !error && <p className="clay-muted small">Chargement des articles…</p>}
      {plan && (
        <>
          <select className="rp-input" value={format} onChange={(e) => setFormat(e.target.value)}>
            {plan.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select className="rp-input" value={article} onChange={(e) => setArticle(e.target.value)}>
            {choix.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.fait ? '✓ ' : ''}
                {a.titre}
                {a.slug === plan.next ? ' (prochain)' : ''}
              </option>
            ))}
          </select>
          {format === 'ambiance' && (
            <select className="rp-input" value={vue} onChange={(e) => setVue(e.target.value)}>
              {plan.vues.map((v) => (
                <option key={v} value={v}>
                  Vue : {v}
                </option>
              ))}
            </select>
          )}
          <select className="rp-input" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            <option value={30}>30 secondes</option>
            <option value={45}>45 secondes</option>
          </select>
          <p className="clay-muted small">
            {format === 'ambiance'
              ? 'Sans voix, tout en clips lents, musique composée par ElevenLabs (≈ 200 à 300 crédits OpenArt).'
              : format === 'visite'
                ? 'La vraie photo de l’article, zoom sur chaque objet, voix douce (presque sans crédit d’image).'
                : 'La pièce banale (image générée), puis la vraie pièce décorée du site, voix douce.'}
          </p>
          <button
            className="clay-btn rp-generate"
            disabled={!article}
            onClick={() =>
              api
                .addToQueue({ kind: 'keurdeco', projectId, format, article, vue, seconds })
                .then(() => {
                  setArticle('');
                  setVue('');
                  onQueued();
                  return load();
                })
                .catch((e) => setError(e.message))
            }
          >
            🎬 Générer la pub
          </button>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

export function AdPage({ projectId, onAdvanced }) {
  const [project, setProject] = useState(null);
  const [studio, setStudio] = useState(null);
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [idea, setIdea] = useState('');
  const [custom, setCustom] = useState('');
  const [ideasBusy, setIdeasBusy] = useState(false);
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
    api.getStudio().then(setStudio).catch(() => setStudio({}));
  }, [projectId]);

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

  const ideas = project?.topicIdeas || [];
  useEffect(() => {
    if (!idea && ideas.length) {
      setIdea(ideas[0]);
    }
  }, [ideas.length]);

  // Une appli sans pub ni idée reçoit tout de suite ses idées (Claude seul).
  const moreIdeas = () => {
    setIdeasBusy(true);
    setError('');
    api
      .suggestTopics(projectId)
      .then(({ jobId }) => followJob(jobId, () => {}))
      .then(() => loadProject())
      .then((p) => p && p.topicIdeas && p.topicIdeas[0] && setIdea(p.topicIdeas[0]))
      .catch((e) => setError(e.message))
      .finally(() => setIdeasBusy(false));
  };
  useEffect(() => {
    if (
      project &&
      project.kind === 'pub' &&
      !['teiki5320/keurcook', 'teiki5320/keurdeco'].includes(String(project.repo || '').toLowerCase()) &&
      !(project.episodes || []).length &&
      !ideas.length &&
      !ideasBusy
    ) {
      moreIdeas();
    }
  }, [project?.id]);

  if (!project) {
    return <div className="clay-content clay-muted">{error || 'Chargement…'}</div>;
  }

  const isPub = project.kind === 'pub';
  const repoKey = String(project.repo || '').toLowerCase();
  const isKeurCook = repoKey === 'teiki5320/keurcook';
  const isKeurDeco = repoKey === 'teiki5320/keurdeco';
  const episodes = [...(project.episodes || [])].sort((a, b) => b.number - a.number);
  const shown =
    episodes.find((e) => e.number === selected) || episodes.find((e) => e.renderedFile) || episodes[0] || null;
  const active = queue.filter((it) => it.status === 'running' || it.status === 'waiting');
  const failed = queue.filter((it) => it.status === 'error').slice(-1)[0];
  const subject = custom.trim() || idea;

  const generate = () => {
    setError('');
    api
      .addToQueue({ kind: isPub ? 'pub' : 'chaine', projectId, angle: subject })
      .then(() => {
        setCustom('');
        return api.queue();
      })
      .then((list) => {
        setQueue(list.filter((it) => it.projectId === projectId));
        loadProject();
      })
      .catch((e) => setError(e.message));
  };

  const remove = (ep) => {
    if (!confirm(`Supprimer « ${ep.title} » (images, voix et MP4) ?`)) {
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

  return (
    <div className="rp">
      <div className="rp-left">
        <Apercu project={project} episode={shown} studio={studio || {}} />
        {shown && (
          <div className="rp-video-title">
            <b>{shown.title}</b>
          </div>
        )}
      </div>

      <div className="rp-right">
        <div className="clay-block">
          <h3>💰 Crédits restants</h3>
          <Credits />
        </div>

        {isKeurCook || isKeurDeco ? (
          (() => {
            const Controls = isKeurCook ? KeurCookAdControls : KeurDecoAdControls;
            return (
              <Controls
                projectId={projectId}
                onQueued={() =>
                  api.queue().then((list) => setQueue(list.filter((it) => it.projectId === projectId)))
                }
              />
            );
          })()
        ) : (
        <div className="clay-block">
          <h3>{isPub ? `📣 Nouvelle pub ${project.title}` : `🎥 Nouvelle vidéo — ${project.title}`}</h3>
          {ideas.length > 0 && (
            <select className="rp-input" value={idea} onChange={(e) => setIdea(e.target.value)}>
              {ideas.map((t, i) => (
                <option key={i} value={t}>
                  {i + 1}. {t}
                </option>
              ))}
            </select>
          )}
          {ideasBusy && <p className="clay-muted small">💡 Claude prépare des idées…</p>}
          <input
            className="rp-input"
            value={custom}
            placeholder={isPub ? 'ou écris ton propre angle…' : 'ou écris ton propre sujet…'}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="clay-btn rp-generate" disabled={subject.trim().length < 5} onClick={generate}>
            🎬 {isPub ? 'Générer la pub' : 'Générer la vidéo'}
          </button>
          <button className="clay-btn ghost small" disabled={ideasBusy} onClick={moreIdeas}>
            💡 Autres idées
          </button>
          {error && <p className="error small">{error}</p>}
        </div>
        )}

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

        {isPub && (
          <ScreenshotsPanel project={project} projectId={projectId} busy={false} onRefresh={loadProject} />
        )}

        <div className="clay-block">
          <h3>{isPub ? '🎞️ Mes pubs' : '🎞️ Mes vidéos'}</h3>
          {episodes.length === 0 && <p className="clay-muted small">Rien pour l'instant.</p>}
          {episodes.map((ep) => (
            <div
              key={ep.number}
              className={`rp-ep${shown && shown.number === ep.number ? ' on' : ''}`}
              onClick={() => setSelected(ep.number)}
            >
              <span className="rp-ep-title">{ep.topic || ep.title}</span>
              <span className={`clay-state ${ep.renderedFile ? 'ok' : 'att'}`}>
                {ep.renderedFile ? 'MP4 prêt' : 'à monter'}
              </span>
              {ep.renderedFile && (
                <a
                  className="clay-btn ghost small"
                  href={`/files/${project.id}/${ep.renderedFile}`}
                  download={`${ep.title}.mp4`}
                  title="Télécharger le MP4"
                  onClick={(e) => e.stopPropagation()}
                >
                  ⬇️
                </a>
              )}
              <button
                className="clay-btn ghost small"
                title="Supprimer"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(ep);
                }}
              >
                🗑️
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {episodes.some((e) => e.renderedFile) && (
              <button
                className="clay-btn ghost small"
                onClick={() => api.openFolder(projectId).catch((e) => alert(e.message))}
              >
                📂 Ouvrir le dossier iCloud
              </button>
            )}
            <button className="clay-btn ghost small" onClick={onAdvanced} title="Scènes, voix, images une par une">
              ⚙️ Réglages avancés
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
