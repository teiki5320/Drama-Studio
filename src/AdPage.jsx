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
import { VideoSave, lienVideo, LogoAfrotok, surLeMac, CasesBoutiques } from './VideoSave.jsx';
import { badgesBoutiques, logoAfrotokVisible } from './apps.js';
const isPubProjet = (p) => p && p.kind === 'pub';
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
          ctaBadges: badgesBoutiques(project, '/studio'),
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
  const seconds = 45;
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
  const seconds = 30;
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
                {f.id === 'ambiance' || f.id === 'timelapse' ? ' · ≈ 250 crédits' : ''}
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

// Keurbook : « Le livre en 30 s » — le prochain livre est proposé ; on peut
// en chercher un autre parmi tous ceux du site.
function KeurbookAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [search, setSearch] = useState('');
  const [livre, setLivre] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    api
      .keurbookPlan(projectId)
      .then((p) => {
        setPlan(p);
        setLivre((cur) => cur || p.next || '');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const q = search.trim().toLowerCase();
  const liste = (plan?.livres || []).filter(
    (l) => !q || `${l.titre} ${l.auteur} ${l.pays}`.toLowerCase().includes(q) || l.slug === livre,
  );
  const choisi = (plan?.livres || []).find((l) => l.slug === livre);
  return (
    <div className="clay-block">
      <h3>📚 Nouvelle pub — Le livre en 30 s</h3>
      {!plan && !error && <p className="clay-muted small">Chargement des livres…</p>}
      {plan && (
        <>
          <input
            className="rp-input"
            value={search}
            placeholder={`Chercher parmi ${plan.livres.length} livres : titre, auteur, pays…`}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="rp-input" value={livre} onChange={(e) => setLivre(e.target.value)}>
            {liste.slice(0, 300).map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.fait ? '✓ ' : ''}
                {l.titre} — {l.auteur}
                {l.pays ? ` (${l.pays})` : ''}
                {l.slug === plan.next ? ' · prochain' : ''}
              </option>
            ))}
          </select>
          <button
            className="clay-btn rp-generate"
            disabled={!livre}
            onClick={() =>
              api
                .addToQueue({ kind: 'keurbook', projectId, livre, label: choisi ? choisi.titre : livre })
                .then(() => {
                  setLivre('');
                  setSearch('');
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

// OptiLED : le calcul en 30 s (vrais chiffres du site) ou le time-lapse.
function OptiledAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [format, setFormat] = useState('calcul');
  const [culture, setCulture] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    api
      .optiledPlan(projectId)
      .then((p) => {
        setPlan(p);
        setCulture((cur) => cur || p.next || '');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const choisie = (plan?.cultures || []).find((c) => c.id === culture);
  return (
    <div className="clay-block">
      <h3>💡 Nouvelle pub OptiLED</h3>
      {!plan && !error && <p className="clay-muted small">Chargement des cultures…</p>}
      {plan && (
        <>
          <select className="rp-input" value={format} onChange={(e) => setFormat(e.target.value)}>
            {plan.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id === 'ambiance' || f.id === 'timelapse' ? ' · ≈ 250 crédits' : ''}
              </option>
            ))}
          </select>
          <select className="rp-input" value={culture} onChange={(e) => setCulture(e.target.value)}>
            {plan.cultures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fait ? '✓ ' : ''}
                {c.nom} — {c.resume}
                {c.id === plan.next ? ' · prochain' : ''}
              </option>
            ))}
          </select>
          <button
            className="clay-btn rp-generate"
            disabled={!culture}
            onClick={() =>
              api
                .addToQueue({ kind: 'optiled', projectId, format, culture, label: choisie ? choisie.nom : culture })
                .then(() => {
                  setCulture('');
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

// Kultiva : semis du mois (illustrations de l'appli), graine → assiette,
// famille avec le Tamassi, ou time-lapse. Région choisie à chaque pub.
function KultivaAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [format, setFormat] = useState('mois');
  const [region, setRegion] = useState('france');
  const [espece, setEspece] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    api
      .kultivaPlan(projectId)
      .then(setPlan)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const especes = (plan?.especes || [])
    .slice()
    .sort((a, b) => Number(b[region]) - Number(a[region]) || a.nom.localeCompare(b.nom, 'fr'));
  const aSemer = especes.filter((e) => e[region]);
  const choisie = especes.find((e) => e.id === espece);
  return (
    <div className="clay-block">
      <h3>🌱 Nouvelle pub Kultiva</h3>
      {!plan && !error && <p className="clay-muted small">Chargement du calendrier…</p>}
      {plan && (
        <>
          <select className="rp-input" value={format} onChange={(e) => setFormat(e.target.value)}>
            {plan.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id === 'ambiance' || f.id === 'timelapse' ? ' · ≈ 250 crédits' : ''}
              </option>
            ))}
          </select>
          <select className="rp-input" value={region} onChange={(e) => setRegion(e.target.value)}>
            {plan.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id === 'france' ? '🇫🇷' : '🌍'} {r.label}
              </option>
            ))}
          </select>
          {format !== 'mois' && (
            <select className="rp-input" value={espece} onChange={(e) => setEspece(e.target.value)}>
              <option value="">Au hasard (de saison)</option>
              {especes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fait ? '✓ ' : ''}
                  {e.emoji} {e.nom}
                  {e[region] ? ` · à semer en ${plan.mois}` : ''}
                </option>
              ))}
            </select>
          )}
          <button
            className="clay-btn rp-generate"
            disabled={format === 'mois' && !aSemer.length}
            onClick={() =>
              api
                .addToQueue({
                  kind: 'kultiva',
                  projectId,
                  format,
                  region,
                  espece: format === 'mois' ? '' : espece,
                  label: format === 'mois' ? plan.mois : choisie ? choisie.nom : '',
                })
                .then(() => {
                  setEspece('');
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

// Palabre : les vrais écrans du jeu — une carte posée au spectateur, un
// mandat en accéléré, ou le palais qui s'achète pièce par pièce.
function PalabreAdControls({ projectId, onQueued }) {
  const [plan, setPlan] = useState(null);
  const [format, setFormat] = useState('question');
  const [carte, setCarte] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    api
      .palabrePlan(projectId)
      .then(setPlan)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);
  const choisie = (plan?.cartes || []).find((c) => c.id === carte);
  return (
    <div className="clay-block">
      <h3>🃏 Nouvelle pub Palabre</h3>
      {!plan && !error && <p className="clay-muted small">Chargement des cartes…</p>}
      {plan && (
        <>
          <select className="rp-input" value={format} onChange={(e) => setFormat(e.target.value)}>
            {plan.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id === 'ambiance' || f.id === 'timelapse' ? ' · ≈ 250 crédits' : ''}
              </option>
            ))}
          </select>
          {format === 'question' && (
            <select className="rp-input" value={carte} onChange={(e) => setCarte(e.target.value)}>
              <option value="">Une carte au hasard</option>
              {plan.cartes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fait ? '✓ ' : ''}
                  {c.titre} — {c.gauche} / {c.droite}
                </option>
              ))}
            </select>
          )}
          <button
            className="clay-btn rp-generate"
            onClick={() =>
              api
                .addToQueue({ kind: 'palabre', projectId, format, carte: format === 'question' ? carte : '', label: choisie ? choisie.titre : '' })
                .then(() => {
                  setCarte('');
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

// Erea : l'anachronisme — un personnage projeté dans une mauvaise époque.
function EreaAdControls({ projectId, project, onQueued }) {
  const [personnage, setPersonnage] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="clay-block">
      <h3>⏳ Nouvelle pub Erea — l'anachronisme</h3>
      <input
        className="rp-input"
        value={personnage}
        placeholder="Personnage (facultatif) — sinon Claude en choisit un nouveau"
        onChange={(e) => setPersonnage(e.target.value)}
      />
      <button
        className="clay-btn rp-generate"
        onClick={() =>
          api
            .addToQueue({ kind: 'erea', projectId, personnage })
            .then(() => {
              setPersonnage('');
              onQueued();
            })
            .catch((e) => setError(e.message))
        }
      >
        🎬 Générer la pub
      </button>
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
      !['teiki5320/keurcook', 'teiki5320/keurdeco', 'teiki5320/keurbook', 'teiki5320/optiled', 'teiki5320/erea', 'teiki5320/kultiva', 'teiki5320/palabre'].includes(
        String(project.repo || '').toLowerCase(),
      ) &&
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
  const isKeurbook = repoKey === 'teiki5320/keurbook';
  const isOptiled = repoKey === 'teiki5320/optiled';
  const isErea = repoKey === 'teiki5320/erea';
  const isKultiva = repoKey === 'teiki5320/kultiva';
  const isPalabre = repoKey === 'teiki5320/palabre';
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
        <Apercu project={project} episode={shown} studio={{ ...(studio || {}), sticker: logoAfrotokVisible(project) ? studio?.sticker : null, outro: isPubProjet(project) ? null : studio?.outro }} />
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

        {isErea ? (
          <EreaAdControls
            projectId={projectId}
            project={project}
            onQueued={() =>
              api.queue().then((list) => setQueue(list.filter((it) => it.projectId === projectId)))
            }
          />
        ) : isKeurCook || isKeurDeco || isKeurbook || isOptiled || isKultiva || isPalabre ? (
          (() => {
            const Controls = isKeurCook
              ? KeurCookAdControls
              : isKeurDeco
                ? KeurDecoAdControls
                : isKeurbook
                  ? KeurbookAdControls
                  : isOptiled
                    ? OptiledAdControls
                    : isKultiva
                      ? KultivaAdControls
                      : PalabreAdControls;
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
              {ep.renderedFile && !surLeMac() && (
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
            <VideoSave project={project} episode={shown && shown.renderedFile ? shown : episodes.find((e) => e.renderedFile)} />
            <button className="clay-btn ghost small" onClick={onAdvanced} title="Refaire une image, un clip ou une voix">
              🔧 Retoucher
            </button>
            <LogoAfrotok project={project} onChange={loadProject} />
            <CasesBoutiques project={project} onChange={loadProject} />
          </div>
        </div>
      </div>
    </div>
  );
}
