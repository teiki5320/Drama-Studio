import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { Episode } from './remotion/Episode.jsx';
import { FPS, WIDTH, HEIGHT, episodeDurationInFrames } from './remotion/timing.js';
import { api, followJob, fileToDataUrl } from './api.js';
import {
  EPISODE_COUNT,
  VOICES,
  plannedVideoCount,
  plannedVideoIndexes,
  wantsLipsync,
  sceneHasDialogue,
  DEFAULT_VIDEO_SCENES,
  MAX_VIDEO_SCENES,
  tiktokCaption,
} from '../shared/catalog.js';
import './studio-redesign.css';

const STATUS_LABELS = {
  script: '📝 script',
  ready: '🎞️ prêt',
  done: '✅ validé',
};

// Lieu de rangement lisible à partir du chemin d'export réel d'un épisode.
function exportPlace(exportedTo) {
  if (!exportedTo) {
    return null;
  }
  const folder = exportedTo.includes('Dramas Synchro')
    ? 'Dramas Synchro'
    : exportedTo.includes('Dramas Long')
      ? 'Dramas Long'
      : 'Dramas';
  if (exportedTo.includes('com~apple~CloudDocs')) {
    return `☁️ iCloud Drive → ${folder}`;
  }
  if (exportedTo.includes('/Desktop/')) {
    return `🖥️ Bureau → ${folder}`;
  }
  return `📁 ${exportedTo.replace(/\/[^/]+$/, '')}`;
}

// ---------- Étape 1 : validation du scénario ----------
function ScriptReview({ project, busy, onRegen, onValidate }) {
  const ep1 = project.episodes[0];
  return (
    <div className="review-panel">
      <div className="review-step">Étape 1 / 3 — Le scénario</div>
      <h2>{project.title}</h2>
      <p className="logline">{project.logline}</p>
      <p className="review-setting">📍 {project.setting}</p>

      <h3>Personnages</h3>
      <ul className="review-list">
        {project.characters.map((c) => (
          <li key={c.id}>
            <strong style={{ color: c.color }}>{c.name}</strong> — {c.role} ({c.gender},{' '}
            {c.age} ans)
          </li>
        ))}
      </ul>

      <h3>La saison en {project.episodeSummaries.length} épisodes</h3>
      <ol className="review-list">
        {project.episodeSummaries.map((s) => (
          <li key={s.number}>
            <strong>{s.title}</strong> — {s.summary}
          </li>
        ))}
      </ol>

      {ep1 && (
        <>
          <h3>Épisode 1 — {ep1.title} (script complet)</h3>
          <div className="review-script">
            {ep1.scenes.map((sc, i) => (
              <div key={sc.id} className="review-scene">
                <div className="review-scene-num">Scène {i + 1}</div>
                {sc.lines.map((l, j) => {
                  const c = project.characters.find((x) => x.id === l.speaker);
                  return (
                    <p key={j}>
                      <strong style={{ color: c ? c.color : '#9c8a5a' }}>
                        {c ? c.name : 'Narrateur'} :
                      </strong>{' '}
                      {l.text}
                    </p>
                  );
                })}
              </div>
            ))}
            {ep1.cliffhanger && <p className="cliffhanger">🔥 Cliffhanger : « {ep1.cliffhanger} »</p>}
          </div>
        </>
      )}

      <div className="review-actions">
        <button className="btn-ghost" disabled={busy} onClick={onRegen}>
          🔄 Régénérer le scénario
        </button>
        <button className="btn-primary" disabled={busy} onClick={onValidate}>
          ✅ Valider le scénario
        </button>
      </div>
    </div>
  );
}

// Carte d'un personnage à l'étape de validation : visage + casting vocal.
function CharReviewCard({ project, projectId, c, busy, runJob, voices = VOICES }) {
  const [instructions, setInstructions] = useState('');
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(c.elevenVoice || '');

  useEffect(() => {
    setVoice(c.elevenVoice || '');
  }, [c.elevenVoice]);

  const voiceOptions = voices.filter(
    (v) => v.gender === (c.gender || 'homme') || v.id === voice,
  );

  const changeVoice = async (voiceId) => {
    setVoice(voiceId);
    try {
      await api.patchCharacter(projectId, c.id, { elevenVoice: voiceId });
    } catch (e) {
      alert(`Changement de voix impossible : ${e.message}`);
    }
  };

  const listen = async () => {
    setListening(true);
    try {
      const { file } = await api.voicePreview(projectId, c.id, voice);
      await new Audio(`/files/${projectId}/${file}`).play();
    } catch (e) {
      alert(`Pré-écoute impossible : ${e.message}`);
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="char-card">
      {c.portrait ? (
        <img src={`/files/${projectId}/${c.portrait}?v=${c.portraitVersion || 0}`} alt={c.name} />
      ) : (
        <div className="char-card-ph">👤</div>
      )}
      <strong style={{ color: c.color }}>{c.name}</strong>
      <span className="char-role">
        {c.role} — {c.age} ans
      </span>

      <div className="voice-row">
        <select value={voice} disabled={busy} onChange={(e) => changeVoice(e.target.value)}>
          {voiceOptions.map((v) => (
            <option key={v.id} value={v.id}>
              🎙️ {v.name} — {v.desc}
            </option>
          ))}
        </select>
        <button
          className="btn-small"
          disabled={busy || listening}
          title="Écouter cette voix avec une réplique du personnage"
          onClick={listen}
        >
          {listening ? '⏳' : '▶️'}
        </button>
      </div>

      <input
        className="face-instructions"
        placeholder="Consignes (optionnel) : plus âgé, boubou bleu…"
        value={instructions}
        maxLength={200}
        onChange={(e) => setInstructions(e.target.value)}
      />
      <div className="char-card-actions">
        <button
          className="btn-small primary"
          disabled={busy}
          title="Claude réécrit l'apparence (guidée par tes consignes), puis le portrait est régénéré"
          onClick={() => runJob(() => api.newFace(projectId, c.id, instructions))}
        >
          ✨ Nouveau visage
        </button>
        <button
          className="btn-small"
          disabled={busy}
          title="Regénère le portrait avec la même description (variation légère)"
          onClick={() => runJob(() => api.regenPortrait(projectId, c.id))}
        >
          🎲
        </button>
      </div>
    </div>
  );
}

// ---------- Étape 2 : validation des personnages ----------
function CharactersReview({ project, busy, runJob, onValidate, projectId, voices }) {
  const missing = project.characters.filter((c) => !c.portrait).length;
  return (
    <div className="review-panel wide">
      <div className="review-step">Étape 2 / 3 — Les personnages</div>
      <h2>Les visages et les voix de « {project.title} »</h2>
      <p className="logline">
        Les portraits servent de référence pour toutes les scènes. « ✨ Nouveau visage » réinvente
        l'apparence (guidée par tes consignes) ; le menu choisit la voix, ▶️ pour l'écouter.
      </p>
      <div className="char-grid">
        {project.characters.map((c) => (
          <CharReviewCard
            key={c.id}
            project={project}
            projectId={projectId}
            c={c}
            busy={busy}
            runJob={runJob}
            voices={voices}
          />
        ))}
      </div>
      <div className="review-actions">
        {missing > 0 && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => runJob(() => api.generatePortraits(projectId))}
          >
            🎨 Générer les portraits manquants ({missing})
          </button>
        )}
        <button className="btn-primary" disabled={busy || missing > 0} onClick={onValidate}>
          ✅ Valider les personnages et produire l'épisode 1
        </button>
      </div>
    </div>
  );
}

// Puce de casting dans l'atelier : portrait + voix modifiable + pré-écoute.
// c = personnage, ou null pour le narrateur (voix stockée sur le projet).
function VoiceChip({ project, projectId, c, busy, runJob, onRefresh, voices = VOICES }) {
  const isNarrator = !c;
  const current = isNarrator
    ? project.narratorVoice || 'onwK4e9ZLuTAKqWW03F9'
    : c.elevenVoice || '';
  const [listening, setListening] = useState(false);

  const options = isNarrator
    ? voices
    : voices.filter((v) => v.gender === (c.gender || 'homme') || v.id === current);

  const change = async (voiceId) => {
    try {
      if (isNarrator) {
        await api.patchProject(projectId, { narratorVoice: voiceId });
      } else {
        await api.patchCharacter(projectId, c.id, { elevenVoice: voiceId });
      }
      onRefresh();
    } catch (e) {
      alert(`Changement de voix impossible : ${e.message}`);
    }
  };

  const listen = async () => {
    setListening(true);
    try {
      const { file } = await api.voicePreview(projectId, isNarrator ? 'narrator' : c.id, current);
      await new Audio(`/files/${projectId}/${file}`).play();
    } catch (e) {
      alert(`Pré-écoute impossible : ${e.message}`);
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="cast-chip">
      <div className="cast-head" title={isNarrator ? 'Voix off du narrateur' : `${c.role} — ${c.visual}`}>
        {isNarrator ? (
          <div className="char-ph">🎙️</div>
        ) : c.portrait ? (
          <img src={`/files/${projectId}/${c.portrait}`} alt={c.name} />
        ) : (
          <div className="char-ph">👤</div>
        )}
        <span style={isNarrator ? undefined : { color: c.color }}>
          {isNarrator ? 'Narrateur' : c.name}
        </span>
        <button
          className="btn-small"
          disabled={listening}
          title="Écouter cette voix avec une vraie réplique"
          onClick={listen}
        >
          {listening ? '⏳' : '▶️'}
        </button>
        {!isNarrator && (
          <button
            className="btn-small"
            disabled={busy}
            title="Régénérer le portrait de référence (visages constants, OpenArt)"
            onClick={() => runJob(() => api.regenPortrait(projectId, c.id))}
          >
            🔄
          </button>
        )}
      </div>
      <select
        value={current}
        disabled={busy}
        title="Changer la voix — puis régénère les voix des scènes pour l'appliquer"
        onChange={(e) => change(e.target.value)}
      >
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            🎙️ {v.name} — {v.desc}
          </option>
        ))}
      </select>
    </div>
  );
}

function SceneCard({ project, episode, scene, index, isAutoVideo, busy, runJob, onRefresh }) {
  const [lines, setLines] = useState(scene.lines);
  const [prompt, setPrompt] = useState(scene.imagePrompt);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLines(scene.lines);
    setPrompt(scene.imagePrompt);
    setDirty(false);
  }, [scene]);

  const audioStale = scene.lines.some((l) => !l.audio);

  const saveText = async () => {
    await api.patchScene(project.id, episode.number, scene.id, { lines, imagePrompt: prompt });
    setDirty(false);
    onRefresh();
  };

  const upload = async (file) => {
    const dataUrl = await fileToDataUrl(file);
    await api.uploadSceneImage(project.id, episode.number, scene.id, dataUrl);
    onRefresh();
  };

  const generateVideo = () => {
    if (
      confirm(
        `${scene.video ? 'Régénérer' : 'Générer'} le clip vidéo de cette scène ?\n\nUn clip vidéo coûte nettement plus de crédits OpenArt qu'une image, et la génération prend plusieurs minutes.`,
      )
    ) {
      runJob(() => api.regenVideo(project.id, episode.number, scene.id));
    }
  };

  const removeVideo = async () => {
    await api.removeVideo(project.id, episode.number, scene.id);
    onRefresh();
  };

  return (
    <div className="scene-card">
      <div className="scene-head">
        <strong>
          Scène {index + 1}
          {scene.video ? (
            <span className="scene-badge">{scene.lipsynced ? '🗣️ vidéo synchro' : '🎬 vidéo'}</span>
          ) : isAutoVideo && !scene.videoDisabled ? (
            <span className="scene-badge dim" title="Cette scène sera animée en clip vidéo à la production">
              🎬 vidéo prévue
            </span>
          ) : null}
        </strong>
        <span className="scene-duration">{(scene.durationSec || 5).toFixed(1)} s</span>
      </div>

      <div className="scene-thumb-row">
        {scene.video ? (
          <video
            className="scene-thumb"
            src={`/files/${project.id}/${scene.video}`}
            muted
            loop
            autoPlay
            playsInline
          />
        ) : scene.image ? (
          <img
            className="scene-thumb"
            src={`/files/${project.id}/${scene.image}`}
            alt={`Scène ${index + 1}`}
          />
        ) : (
          <div className="scene-thumb empty">Pas d'image</div>
        )}
        <div className="scene-lines">
          {lines.map((line, j) => (
            <div key={j} className="line-edit">
              <select
                value={line.speaker}
                onChange={(e) => {
                  const next = lines.map((l, k) => (k === j ? { ...l, speaker: e.target.value } : l));
                  setLines(next);
                  setDirty(true);
                }}
              >
                <option value="narrator">🎙️ Narrateur</option>
                {project.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={line.text}
                onChange={(e) => {
                  const next = lines.map((l, k) => (k === j ? { ...l, text: e.target.value } : l));
                  setLines(next);
                  setDirty(true);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <details className="prompt-details">
        <summary>Prompt de l'image</summary>
        <textarea rows={4} value={prompt} onChange={(e) => { setPrompt(e.target.value); setDirty(true); }} />
        <button
          className="btn-ghost"
          onClick={() => navigator.clipboard.writeText(prompt)}
          title="Pour générer l'image sur openart.ai"
        >
          📋 Copier le prompt (OpenArt)
        </button>
      </details>

      <div className="scene-actions">
        {dirty && (
          <button className="btn-small primary" disabled={busy} onClick={saveText}>
            💾 Enregistrer
          </button>
        )}
        <button
          className="btn-small"
          disabled={busy}
          onClick={() => runJob(() => api.regenImage(project.id, episode.number, scene.id, prompt))}
        >
          🖼️ Régénérer l'image
        </button>
        <label className="btn-small upload">
          ⬆️ Importer une image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => e.target.files[0] && upload(e.target.files[0])}
          />
        </label>
        <button
          className={`btn-small ${audioStale ? 'primary' : ''}`}
          disabled={busy}
          onClick={() => runJob(() => api.regenAudio(project.id, episode.number, scene.id))}
        >
          🔊 {audioStale ? 'Générer la voix' : 'Régénérer la voix'}
        </button>
        <button
          className="btn-small"
          disabled={busy || !scene.image}
          title="Anime cette scène en clip vidéo (image-to-video OpenArt) — plus coûteux qu'une image"
          onClick={generateVideo}
        >
          🎬 {scene.video ? 'Régénérer la vidéo' : 'Générer la vidéo'}
        </button>
        {scene.video && wantsLipsync(project) && sceneHasDialogue(scene) && (
          <button
            className={`btn-small ${scene.lipsynced ? '' : 'primary'}`}
            disabled={busy}
            title="Anime les lèvres du clip sur les voix de la scène (fal.ai, payant à l'usage)"
            onClick={() => runJob(() => api.lipsyncScene(project.id, episode.number, scene.id))}
          >
            🗣️ {scene.lipsynced ? 'Resynchroniser les lèvres' : 'Synchroniser les lèvres'}
          </button>
        )}
        {scene.video && (
          <button
            className="btn-small"
            disabled={busy}
            title="Retire le clip vidéo et revient à l'image animée (Ken Burns)"
            onClick={removeVideo}
          >
            🖼️ Revenir à l'image
          </button>
        )}
      </div>
      {scene.imageError && <p className="error small">Image : {scene.imageError}</p>}
      {scene.videoError && <p className="error small">Vidéo : {scene.videoError}</p>}
      {scene.lipsyncError && <p className="error small">Synchro : {scene.lipsyncError}</p>}
      {wantsLipsync(project) &&
        sceneHasDialogue(scene) &&
        scene.video &&
        !scene.lipsynced &&
        !scene.lipsyncError && (
          <p className="error small">
            🗣️ Clip pas encore synchronisé avec les voix — clique « Synchroniser les lèvres ».
          </p>
        )}
      {scene.lines.some((l) => l.audioFallback) && (
        <p className="error small">
          ⚠️ Voix de secours utilisée (ElevenLabs indisponible — crédits épuisés ?). Régénère la
          voix de cette scène une fois le solde revenu.
        </p>
      )}
      {scene.lines.some((l) => l.audioError) && (
        <p className="error small">Voix : {scene.lines.find((l) => l.audioError).audioError}</p>
      )}
    </div>
  );
}

export function ProjectView({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [epNumber, setEpNumber] = useState(1);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [credits, setCredits] = useState(null);
  const [studio, setStudio] = useState(null);
  const [justRendered, setJustRendered] = useState(null);
  const [repairDismissed, setRepairDismissed] = useState(false);
  const [topic, setTopic] = useState('');
  const [voices, setVoices] = useState(VOICES);

  const loadCredits = () => api.credits().then(setCredits).catch(() => {});

  const refresh = () =>
    api.getProject(projectId).then((p) => {
      setProject(p);
      setPlayerKey((k) => k + 1);
      return p;
    });

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    loadCredits();
    api.getStudio().then(setStudio).catch(() => {});
    api.voices().then(setVoices).catch(() => {});
    // Raccroche une production en cours (après un rechargement de la page)
    api
      .activeJob(projectId)
      .then((j) => {
        if (j && j.status === 'running') {
          setBusy(true);
          let tick = 0;
          followJob(j.id, (jj) => {
            setJob(jj);
            if (++tick % 5 === 0) refresh().catch(() => {});
          })
            .catch((e) => setError(e.message))
            .finally(() => {
              setBusy(false);
              setJob(null);
              refresh().catch(() => {});
              loadCredits();
            });
        }
      })
      .catch(() => {});
  }, [projectId]);

  const episode = useMemo(
    () => project?.episodes?.find((e) => e.number === epNumber) || null,
    [project, epNumber],
  );

  useEffect(() => {
    setJustRendered(null);
    setRepairDismissed(false);
  }, [epNumber]);

  const isChaine = project?.mode === 'chaine';

  // Une chaîne peut avoir sa propre outro (sinon la marque globale s'applique).
  const effectiveStudio = useMemo(() => {
    if (project?.channelOutro) {
      return {
        ...(studio || {}),
        outro: project.channelOutro,
        outroIsVideo: Boolean(project.channelOutroIsVideo),
        outroDurationSec: project.channelOutroDurationSec || 4,
      };
    }
    return studio;
  }, [studio, project]);

  const duration = useMemo(
    () => (episode ? episodeDurationInFrames(episode, effectiveStudio, isChaine) : FPS * 3),
    [episode, effectiveStudio, isChaine],
  );

  const runJob = async (kickoff) => {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await kickoff();
      let tick = 0;
      await followJob(jobId, (j) => {
        setJob(j);
        // rafraîchit le projet en continu pendant les longues productions
        if (++tick % 5 === 0) refresh().catch(() => {});
      });
      await refresh();
      loadCredits();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
      setJob(null);
    }
  };

  const produce = async (n) => {
    const ok = await runJob(() => api.produceEpisode(projectId, n));
    if (ok) {
      setEpNumber(n);
    }
  };

  const uploadMusic = async (file) => {
    const dataUrl = await fileToDataUrl(file);
    await api.uploadMusic(projectId, dataUrl);
    refresh();
  };

  if (!project) {
    return (
      <div className="page centered">
        <div className="spinner" />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const totalEpisodes = project.episodeCount || EPISODE_COUNT;
  const producedNumbers = project.episodes.map((e) => e.number);
  const nextNumber = producedNumbers.length < totalEpisodes ? Math.max(...producedNumbers) + 1 : null;
  const currentDone = episode?.status === 'done';
  const stage = project.stage || 'production';
  const renderedEpisodes = project.episodes.filter((e) => e.renderedFile);
  const remainingCount =
    totalEpisodes - project.episodes.filter((e) => e.status === 'done' && e.renderedFile).length;

  const header = (
    <header className="project-header">
      <button className="btn-ghost" onClick={onBack}>
        ← Mes dramas
      </button>
      <div className="project-title">
        <h1>
          {project.title}
          {project.mode === 'synchro' && (
            <span className="scene-badge" title="Version Synchro : lèvres animées via fal.ai">
              🗣️ Synchro
            </span>
          )}
          {project.mode === 'long' && (
            <span
              className="scene-badge"
              title={`Format long : ${project.episodeCount} épisodes de 40 secondes — tout vidéo, lèvres synchronisées`}
            >
              📺 Long · {project.episodeCount} ép.
            </span>
          )}
          {isChaine && (
            <span
              className="scene-badge"
              title={`Chaîne : vidéos de ${project.targetSeconds || 90} s, narrateur seul`}
            >
              🎥 Chaîne · {project.targetSeconds || 90} s
            </span>
          )}
        </h1>
        <p className="logline">{project.logline}</p>
      </div>
      {isChaine && (
        <>
          <label className="btn-ghost upload" title="L'outro de cette chaîne (vidéo courte ou image), ajoutée à la fin de chaque vidéo. Sinon, l'outro globale de « Ma marque » s'applique.">
            {project.channelOutro ? '🎞️ Changer l\'outro' : '🎞️ Outro de la chaîne'}
            <input
              type="file"
              accept="video/mp4,video/quicktime,image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) {
                  fileToDataUrl(f)
                    .then((d) => api.uploadChannelOutro(projectId, d))
                    .then(refresh)
                    .catch((err) => alert(`Envoi impossible : ${err.message}`));
                }
              }}
            />
          </label>
          {project.channelOutro && (
            <button
              className="btn-ghost"
              title="Retirer l'outro de la chaîne (retour à l'outro globale)"
              onClick={() => api.deleteChannelOutro(projectId).then(refresh)}
            >
              🗑️
            </button>
          )}
        </>
      )}
      {stage === 'production' && (
        <>
          <label
            className="video-count"
            title="Nombre de scènes animées en clip vidéo par épisode (réparties de la première à la dernière). Chaque vidéo coûte nettement plus de crédits OpenArt qu'une image — 0 pour tout garder en images animées. En Format long, « Toutes » (le défaut) = style DramaWave, tout en vidéo."
          >
            🎬 Vidéos/épisode
            <select
              value={
                project.videoScenes ?? (project.mode === 'long' ? 'all' : DEFAULT_VIDEO_SCENES)
              }
              disabled={busy}
              onChange={(e) =>
                api
                  .patchProject(projectId, {
                    videoScenes: e.target.value === 'all' ? null : Number(e.target.value),
                  })
                  .then(refresh)
                  .catch((err) => alert(err.message))
              }
            >
              {project.mode === 'long' && <option value="all">Toutes</option>}
              {Array.from({ length: MAX_VIDEO_SCENES + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label
            className="video-count"
            title="Éco : tous les clips durent 5 secondes (le minimum facturé — moitié prix), puis l'image gèle jusqu'à la fin de la scène. Adaptée : le clip suit la durée de la scène (5 à 10 s, plus cher)."
          >
            ⏱️ Durée clips
            <select
              value={project.videoSeconds || 'eco'}
              disabled={busy}
              onChange={(e) =>
                api
                  .patchProject(projectId, { videoSeconds: e.target.value })
                  .then(refresh)
                  .catch((err) => alert(err.message))
              }
            >
              <option value="eco">Éco — 5 s</option>
              <option value="auto">Adaptée — 5 à 10 s</option>
            </select>
          </label>
          {!isChaine && (
            <button
              className="btn-ghost"
              disabled={busy}
              title="Revoir les visages et les voix des personnages"
              onClick={() => api.reviewCharacters(projectId).then(refresh)}
            >
              👥 Personnages
            </button>
          )}
        </>
      )}
      <label className="btn-ghost upload" title="Musique de fond de tous les épisodes (MP3)">
        {project.musicFile ? '🎵 Changer la musique' : '🎵 Ajouter une musique'}
        <input
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
          hidden
          onChange={(e) => e.target.files[0] && uploadMusic(e.target.files[0])}
        />
      </label>
    </header>
  );

  const jobBanner = (
    <>
      {busy && (
        <div className="banner info job-banner">
          <div className="spinner small" />
          {job?.step || 'Traitement…'}
          {job?.progress != null && ` (${Math.round(job.progress * 100)} %)`}
        </div>
      )}
      {error && <div className="banner warn">{error}</div>}
    </>
  );

  // ---------- Détection des ratés : images, clips vidéo prévus, voix ----------
  const frList = (nums) =>
    nums.length === 1 ? `${nums[0]}` : `${nums.slice(0, -1).join(', ')} et ${nums[nums.length - 1]}`;

  const autoVideoIdx = episode ? plannedVideoIndexes(project, episode.scenes.length) : [];
  const failedImages = episode
    ? episode.scenes.map((s, i) => (!s.image || s.imageError ? i + 1 : null)).filter(Boolean)
    : [];
  const failedVideos = episode
    ? episode.scenes
        .map((s, i) => {
          const expected = autoVideoIdx.includes(i) || Boolean(s.videoError);
          return expected && !s.videoDisabled && s.image && (!s.video || s.videoError)
            ? i + 1
            : null;
        })
        .filter(Boolean)
    : [];
  const failedVoices = episode
    ? episode.scenes
        .map((s, i) => ((s.lines || []).some((l) => !l.audio || l.audioError) ? i + 1 : null))
        .filter(Boolean)
    : [];
  const failedSyncs =
    episode && wantsLipsync(project)
      ? episode.scenes
          .map((s, i) =>
            s.video && !s.videoDisabled && sceneHasDialogue(s) && (!s.lipsynced || s.lipsyncError)
              ? i + 1
              : null,
          )
          .filter(Boolean)
      : [];

  const failParts = [];
  if (failedImages.length > 0) {
    failParts.push(
      failedImages.length > 1
        ? `les images des scènes ${frList(failedImages)} n'ont pas été bien générées`
        : `l'image de la scène ${failedImages[0]} n'a pas été bien générée`,
    );
  }
  if (failedVideos.length > 0) {
    failParts.push(
      failedVideos.length > 1
        ? `les clips vidéo des scènes ${frList(failedVideos)} manquent`
        : `le clip vidéo de la scène ${failedVideos[0]} manque`,
    );
  }
  if (failedVoices.length > 0) {
    failParts.push(
      failedVoices.length > 1
        ? `des voix manquent aux scènes ${frList(failedVoices)}`
        : `des voix manquent à la scène ${failedVoices[0]}`,
    );
  }
  if (failedSyncs.length > 0) {
    failParts.push(
      failedSyncs.length > 1
        ? `la synchro labiale manque aux scènes ${frList(failedSyncs)}`
        : `la synchro labiale manque à la scène ${failedSyncs[0]}`,
    );
  }
  const repairSentence =
    failParts.length > 0
      ? failParts.join(' ; ').replace(/^./, (c) => c.toUpperCase())
      : null;

  const repairBanner =
    !busy && !repairDismissed && episode && episode.status !== 'script' && repairSentence ? (
      <div className="banner warn repair-banner">
        <span>⚠️ {repairSentence}. Souhaites-tu les relancer ?</span>
        <div className="repair-actions">
          <button
            className="btn-small primary"
            onClick={() => runJob(() => api.retryAssets(projectId, epNumber))}
          >
            🔄 Oui, relancer
          </button>
          <button className="btn-small" onClick={() => setRepairDismissed(true)}>
            Non, plus tard
          </button>
        </div>
      </div>
    ) : null;

  const u = project.usage || {};
  const fr = (n) => Number(n || 0).toLocaleString('fr-FR');
  const oa = credits?.openart;
  const el = credits?.elevenlabs;
  const elRest = el && el.limit != null ? Math.max(0, el.limit - el.used) : null;
  const elPct = elRest != null && el.limit > 0 ? Math.round((elRest / el.limit) * 100) : null;
  const elReset = el?.resetAt
    ? new Date(el.resetAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null;

  const freeBits = [];
  if (u.pollinationsImages) freeBits.push(`${fr(u.pollinationsImages)} images Pollinations`);
  if (u.falImages) freeBits.push(`${fr(u.falImages)} images fal.ai`);
  if (u.falLipsyncs) freeBits.push(`🗣️ ${fr(u.falLipsyncs)} synchros labiales fal.ai (payant)`);
  if (u.edgeClips) freeBits.push(`${fr(u.edgeClips)} répliques Edge TTS`);
  if (u.sayClips) freeBits.push(`${fr(u.sayClips)} répliques voix macOS`);

  // Panneau de coûts détaillé (écrans de validation).
  const usageBar = (
    <div className="usage-panel">
      <div className="usage-head">
        <span className="usage-title">💰 Coûts</span>
        <button className="btn-small" title="Actualiser les soldes des comptes" onClick={loadCredits}>
          ↻ Actualiser
        </button>
      </div>
      <div className="usage-cards">
        {(oa || u.openartImages > 0 || u.openartVideos > 0) && (
          <div className="usage-card">
            <div className="usage-name">🎨 OpenArt — images &amp; vidéos</div>
            {oa?.credits != null ? (
              <div className="usage-big">{fr(oa.credits)} <small>crédits restants</small></div>
            ) : oa?.error ? (
              <div className="usage-note">Solde indisponible ({oa.error})</div>
            ) : (
              <div className="usage-big">…</div>
            )}
            <div className="usage-sub">
              Ce drama : <strong>{fr(u.openartImages)}</strong> images ·{' '}
              <strong>{fr(u.openartVideos)}</strong> clips vidéo
            </div>
          </div>
        )}
        <div className="usage-card">
          <div className="usage-name">🎙️ ElevenLabs — voix</div>
          {elRest != null ? (
            <>
              <div className="usage-big">{fr(elRest)} <small>crédits restants</small></div>
              <div className="gauge" title={`${elPct} % restants`}>
                <div className={`gauge-fill ${elPct <= 15 ? 'low' : ''}`} style={{ width: `${elPct}%` }} />
              </div>
              <div className="usage-note">
                sur {fr(el.limit)}{elReset ? ` · recharge le ${elReset}` : ''}
              </div>
            </>
          ) : el?.error === 'permission' ? (
            <div className="usage-note">
              Solde masqué — ajoute la permission « User → Read » à ta clé ElevenLabs
            </div>
          ) : el?.error ? (
            <div className="usage-note">Solde indisponible ({el.error})</div>
          ) : (
            <div className="usage-big">…</div>
          )}
          <div className="usage-sub">
            Ce drama : <strong>{fr(u.elevenChars)}</strong> crédits ({fr(u.elevenClips)} répliques)
          </div>
        </div>
        <div className="usage-card">
          <div className="usage-name">🤖 Claude — scénarios</div>
          <div className="usage-big">Inclus <small>dans ton abonnement</small></div>
          <div className="usage-sub">
            Ce drama : <strong>{fr(u.claudeCalls)}</strong> écritures de scénario
          </div>
        </div>
      </div>
      {freeBits.length > 0 && <div className="usage-free">Et aussi : {freeBits.join(' · ')}</div>}
    </div>
  );

  // Bandeau de coûts compact, toujours visible dans l'atelier de production.
  const costRibbon = (
    <div className="cost-ribbon">
      <span className="cr-label">💰 Soldes</span>
      <div className="cost-chip">
        <span>🎨</span>
        <span>OpenArt</span>
        <strong>{oa?.credits != null ? fr(oa.credits) : '…'}</strong>
        <span className="cr-sub">· ce drama {fr(u.openartImages)} img / {fr(u.openartVideos)} vid</span>
      </div>
      <div className="cost-chip">
        <span>🎙️</span>
        <span>ElevenLabs</span>
        <strong>{elRest != null ? fr(elRest) : '…'}</strong>
        {elPct != null && (
          <div className="gauge" title={`${elPct} % restants`}>
            <div className={`gauge-fill ${elPct <= 15 ? 'low' : ''}`} style={{ width: `${elPct}%` }} />
          </div>
        )}
      </div>
      <div className="cost-chip">
        <span>🤖</span>
        <span>Claude</span>
        <strong>Inclus</strong>
        <span className="cr-sub">dans ton abonnement</span>
      </div>
      <button className="btn-small cr-refresh" title="Actualiser les soldes des comptes" onClick={loadCredits}>
        ↻ Actualiser
      </button>
    </div>
  );

  if (stage === 'script_review') {
    return (
      <div className="page project">
        {header}
        {usageBar}
        {jobBanner}
        <ScriptReview
          project={project}
          busy={busy}
          onRegen={() => runJob(() => api.regenScript(projectId))}
          onValidate={() => runJob(() => api.validateScript(projectId))}
        />
      </div>
    );
  }

  if (stage === 'characters_review') {
    return (
      <div className="page project">
        {header}
        {usageBar}
        {jobBanner}
        <CharactersReview
          project={project}
          projectId={projectId}
          busy={busy}
          runJob={runJob}
          voices={voices}
          onValidate={() => runJob(() => api.validateCharacters(projectId)).then((ok) => ok && setEpNumber(1))}
        />
      </div>
    );
  }

  const tabNumbers = isChaine
    ? project.episodes.map((e) => e.number)
    : Array.from({ length: totalEpisodes }, (_, i) => i + 1);

  const episodeTabs = (
    <nav className="episode-tabs">
      {tabNumbers.map((n) => {
        const ep = project.episodes.find((e) => e.number === n);
        const summary = project.episodeSummaries.find((s) => s.number === n);
        return (
          <button
            key={n}
            className={`ep-tab ${n === epNumber ? 'active' : ''} ${ep ? 'exists' : ''}`}
            title={
              isChaine && ep
                ? ep.topic || ep.title
                : summary
                  ? `${summary.title} — ${summary.summary}`
                  : ''
            }
            onClick={() => ep && setEpNumber(n)}
            disabled={!ep}
          >
            {n}
            {ep && <span className="ep-status">{STATUS_LABELS[ep.status] || ep.status}</span>}
          </button>
        );
      })}
      {isChaine && tabNumbers.length === 0 && (
        <span className="cast-hint" style={{ margin: 0 }}>
          Aucune vidéo pour l'instant — donne un sujet ci-dessous pour créer la première.
        </span>
      )}
    </nav>
  );

  // Barre des chaînes : créer une vidéo par sujet + idées proposées par Claude.
  const createVideoFromTopic = async (t) => {
    const ok = await runJob(() => api.createChannelVideo(projectId, t));
    if (ok) {
      setTopic('');
      const p = await api.getProject(projectId).catch(() => null);
      if (p) {
        setProject(p);
        const maxN = Math.max(...p.episodes.map((e) => e.number));
        setEpNumber(maxN);
      }
    }
  };

  const topicBar = isChaine ? (
    <>
      <div className="topic-bar">
        <input
          value={topic}
          maxLength={300}
          placeholder="Sujet de la prochaine vidéo — ex. « l'histoire vraie de Thomas Sankara »"
          onChange={(e) => setTopic(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={busy || topic.trim().length < 5}
          onClick={() => createVideoFromTopic(topic.trim())}
        >
          ➕ Créer la vidéo
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          title="Claude propose 10 sujets dans le thème de la chaîne"
          onClick={() => runJob(() => api.suggestTopics(projectId))}
        >
          💡 Proposer des sujets
        </button>
      </div>
      {(project.topicIdeas || []).length > 0 && (
        <div className="topic-ideas">
          {(project.topicIdeas || []).slice(0, 10).map((t, i) => (
            <button
              key={i}
              className="dl-chip"
              title="Cliquer pour reprendre ce sujet"
              onClick={() => setTopic(t)}
            >
              💡 {t}
            </button>
          ))}
        </div>
      )}
    </>
  ) : null;

  const openFolder = () =>
    api.openFolder(projectId).catch((e) => alert(`Ouverture du dossier : ${e.message}`));

  // Devis avant production — estimations moyennes (image ~8, clip éco ~30,
  // clip adapté ~55 crédits OpenArt ; ~850 caractères ElevenLabs par épisode).
  const quote = (nEpisodes) => {
    const vidCost = (project.videoSeconds || 'eco') === 'eco' ? 30 : 55;
    let imgs = 9;
    let chars = 850;
    if (project.mode === 'long') {
      imgs = 6;
      chars = 600;
    }
    if (isChaine) {
      const sec = project.targetSeconds || 90;
      imgs = Math.max(6, Math.round(sec / 8));
      chars = Math.round(sec * 14);
    }
    // « imgs » sert aussi d'estimation du nombre de scènes par épisode.
    const vids = plannedVideoCount(project, imgs);
    const oa = (imgs * 8 + vids * vidCost) * nEpisodes;
    const el = chars * nEpisodes;
    const oaRest = credits?.openart?.credits;
    let msg = `Estimation : ~${fr(oa)} crédits OpenArt et ~${fr(el)} crédits ElevenLabs.`;
    if (vids > 0 && wantsLipsync(project)) {
      msg += `\n+ la synchro labiale fal.ai des scènes parlées (facturée à l'usage sur ton compte fal.ai).`;
    }
    if (oaRest != null || elRest != null) {
      msg += `\nIl te reste :${oaRest != null ? ` ${fr(oaRest)} OpenArt` : ''}${
        oaRest != null && elRest != null ? ' ·' : ''
      }${elRest != null ? ` ${fr(elRest)} ElevenLabs` : ''}.`;
    }
    if (oaRest != null && oaRest < oa) {
      msg += `\n⚠️ Ton solde OpenArt semble INSUFFISANT pour cette production !`;
    }
    if (elRest != null && elRest < el) {
      msg += `\n⚠️ Ton solde ElevenLabs semble INSUFFISANT (les voix passeront en secours) !`;
    }
    return msg;
  };

  const place =
    exportPlace(episode?.exportedTo) ||
    exportPlace(project.episodes.find((e) => e.exportedTo)?.exportedTo);
  // Chaîne : le dossier porte le nom de la chaîne (pas « Dramas »).
  const placeText = isChaine
    ? `${place ? place.split('→')[0].trim() : '📁'} → ${project.title}`
    : place
      ? `${place} → ${project.title}`
      : null;

  const playerActions = (
    <div className="player-actions">
      {episode?.status === 'script' && (
        <button
          className="btn-primary"
          disabled={busy}
          title="La production de cet épisode a été interrompue : reprend là où elle s'était arrêtée. Ce qui existe déjà (images, voix, clips) n'est PAS régénéré."
          onClick={() => {
            if (
              confirm(
                isChaine
                  ? `Produire la vidéo ${epNumber} (images, voix, clip) ?\n\n${quote(1)}`
                  : `Reprendre la production de l'épisode ${epNumber} ?\n\nSeuls les éléments manquants seront générés — l'existant n'est pas re-payé.\n\n${quote(1)}\n(C'est le maximum : la reprise coûte souvent bien moins.)`,
              )
            ) {
              runJob(() => api.produceEpisode(projectId, epNumber));
            }
          }}
        >
          ▶️ {isChaine ? `Produire la vidéo ${epNumber}` : `Reprendre la production de l'épisode ${epNumber}`}
        </button>
      )}
      {justRendered === epNumber && episode?.renderedFile && (
        <div className="render-success">
          <div className="rs-title">🎉 Épisode {episode.number} terminé !</div>
          <p>
            Le MP4 est rangé automatiquement dans{' '}
            <strong>{placeText || `le dossier ${isChaine ? project.title : 'Dramas'}`}</strong>.
          </p>
          <div className="rs-actions">
            <button className="btn-small primary" onClick={openFolder}>
              📂 Ouvrir le dossier
            </button>
            <a
              className="btn-small"
              href={`/files/${project.id}/${episode.renderedFile}`}
              download={`${tiktokCaption(project, episode)}.mp4`}
              title="Télécharge une copie dans le dossier Téléchargements de Safari — le nom du fichier = ta description TikTok"
            >
              ⬇️ Télécharger une copie
            </a>
          </div>
        </div>
      )}
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() =>
          runJob(() => api.renderEpisode(projectId, epNumber)).then(
            (ok) => ok && setJustRendered(epNumber),
          )
        }
      >
        ✅ Valider et produire le MP4
      </button>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={() => {
          if (confirm('Régénérer toutes les images de cet épisode avec le fournisseur actuel ?')) {
            runJob(() => api.regenAllImages(projectId, epNumber));
          }
        }}
      >
        🖼️ Régénérer toutes les images
      </button>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={() => {
          if (confirm('Régénérer toutes les voix de cet épisode ?')) {
            runJob(() => api.regenAllAudio(projectId, epNumber));
          }
        }}
      >
        🔊 Générer toutes les voix
      </button>
      {episode?.renderedFile && (
        <a
          className="btn-ghost"
          href={`/files/${project.id}/${episode.renderedFile}`}
          download={`${tiktokCaption(project, episode)}.mp4`}
          title="Le nom du fichier = titre + hashtags, prêt pour la description TikTok"
        >
          ⬇️ Télécharger l'épisode {episode.number}
        </a>
      )}
      {nextNumber && !isChaine && (
        <button
          className={`btn-primary next ${currentDone ? '' : 'secondary'}`}
          disabled={busy}
          onClick={() => {
            const warn = currentDone
              ? ''
              : "L'épisode courant n'est pas encore validé.\n\n";
            if (confirm(`${warn}Produire l'épisode ${nextNumber} ?\n\n${quote(1)}`)) {
              produce(nextNumber);
            }
          }}
        >
          ▶️ Produire l'épisode {nextNumber}
        </button>
      )}
      {remainingCount > 0 && !isChaine && (
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            const nVid = plannedVideoCount(project, 6);
            if (
              confirm(
                `Produire automatiquement les ${remainingCount} épisodes restants (scénario, images${nVid > 0 ? ', clips vidéo' : ''}, voix et MP4) ?\n\n${quote(remainingCount)}\n\nC'est long — souvent plus d'une heure avec OpenArt. Tu peux fermer la page et revenir : la production continue et l'avancement se raccroche tout seul.`,
              )
            ) {
              runJob(() => api.produceSeason(projectId));
            }
          }}
        >
          🚀 Produire toute la saison ({remainingCount} restant{remainingCount > 1 ? 's' : ''})
        </button>
      )}
      {renderedEpisodes.length > 0 && (
        <div className="downloads-box">
          <div className="downloads-title">📥 Épisodes prêts</div>
          <div className="downloads-links">
            {renderedEpisodes.map((e) => (
              <a
                key={e.number}
                className="dl-chip"
                href={`/files/${project.id}/${e.renderedFile}`}
                download={`${tiktokCaption(project, e)}.mp4`}
                title={`${e.title} — nom du fichier = description TikTok prête`}
              >
                Ép. {e.number}
              </a>
            ))}
            {renderedEpisodes.length > 1 && (
              <a className="dl-chip all" href={`/api/projects/${project.id}/season.zip`}>
                ⬇️ Tout (.zip)
              </a>
            )}
          </div>
          <p className="downloads-hint">
            {placeText ? (
              <>
                Rangés automatiquement dans <strong>{placeText}</strong>{' '}
              </>
            ) : (
              <>
                Rangés automatiquement dans le dossier{' '}
                <strong>{isChaine ? project.title : 'Dramas'}</strong>{' '}
              </>
            )}
            <button className="btn-small" onClick={openFolder} title="Ouvrir dans le Finder">
              📂 Ouvrir
            </button>
          </p>
          <p className="downloads-hint">
            🏷️ Le nom de chaque fichier = <strong>titre + hashtags</strong> : TikTok pré-remplit
            la description à l'import.{' '}
            {episode && (
              <button
                className="btn-small"
                title={tiktokCaption(project, episode)}
                onClick={() => navigator.clipboard.writeText(tiktokCaption(project, episode))}
              >
                📋 Copier la description de l'ép. {episode.number}
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="studio project">
      {header}
      {episodeTabs}
      {topicBar}
      {costRibbon}
      {jobBanner}
      {repairBanner}

      {episode ? (
        <div className="studio-main">
          {/* Colonne lecteur + actions : toujours dans le viewport, jamais besoin de scroller la page */}
          <aside className="studio-player-col">
            <div className="player-frame">
              <Player
                key={playerKey}
                component={Episode}
                inputProps={{
                  episode,
                  characters: project.characters,
                  assetBase: `/files/${project.id}`,
                  musicFile: project.musicFile,
                  seriesTitle: project.title,
                  studio: effectiveStudio,
                  studioBase: '/studio',
                  noOutroCard: isChaine,
                }}
                durationInFrames={duration}
                fps={FPS}
                compositionWidth={WIDTH}
                compositionHeight={HEIGHT}
                controls
                acknowledgeRemotionLicense
                style={{ width: '100%', aspectRatio: '9 / 16' }}
              />
            </div>
            {playerActions}
          </aside>

          {/* Colonne scènes : le seul élément qui défile */}
          <section className="studio-scenes scenes-column">
            <div className="char-strip">
              <VoiceChip
                project={project}
                projectId={projectId}
                c={null}
                busy={busy}
                runJob={runJob}
                onRefresh={refresh}
                voices={voices}
              />
              {project.characters.map((c) => (
                <VoiceChip
                  key={c.id}
                  project={project}
                  projectId={projectId}
                  c={c}
                  busy={busy}
                  runJob={runJob}
                  onRefresh={refresh}
                  voices={voices}
                />
              ))}
            </div>
            <p className="cast-hint">
              🎙️ Change une voix ici (▶️ pour l'écouter), puis clique « 🔊 Régénérer la voix » sur
              une scène — ou « 🔊 Générer toutes les voix » — pour l'appliquer.
            </p>
            <h2>
              {isChaine ? 'Vidéo' : 'Épisode'} {episode.number} — {episode.title}
            </h2>
            {episode.cliffhanger && <p className="cliffhanger">Cliffhanger : « {episode.cliffhanger} »</p>}
            {episode.scenes.map((scene, i) => (
              <SceneCard
                key={scene.id}
                project={project}
                episode={episode}
                scene={scene}
                index={i}
                isAutoVideo={plannedVideoIndexes(project, episode.scenes.length).includes(i)}
                busy={busy}
                runJob={runJob}
                onRefresh={refresh}
              />
            ))}
          </section>
        </div>
      ) : (
        <div className="centered">
          <p>Cet épisode n'a pas encore été produit.</p>
        </div>
      )}
    </div>
  );
}
