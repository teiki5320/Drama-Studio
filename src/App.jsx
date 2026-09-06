import React, { useEffect, useRef, useState } from 'react';
import { STYLES, MAX_STYLES, EPISODE_COUNT, VOICES } from '../shared/catalog.js';
import { api, followJob, fileToDataUrl } from './api.js';
import { ProjectView } from './ProjectView.jsx';

function StylePicker({ selected, onToggle }) {
  return (
    <div className="style-grid">
      {STYLES.map((s) => {
        const active = selected.includes(s.id);
        const full = !active && selected.length >= MAX_STYLES;
        return (
          <button
            key={s.id}
            className={`style-chip ${active ? 'active' : ''} ${full ? 'disabled' : ''}`}
            onClick={() => !full && onToggle(s.id)}
          >
            <span className="style-emoji">{s.emoji}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// « Ma marque » : sticker (logo) et outro perso, appliqués à tous les épisodes.
function BrandCard({ studio, onChange }) {
  const [busy, setBusy] = useState(false);

  const upload = async (file, kind) => {
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (kind === 'sticker') {
        await api.uploadSticker(dataUrl);
      } else {
        await api.uploadOutro(dataUrl);
      }
      onChange();
    } catch (e) {
      alert(`Envoi impossible : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind) => {
    setBusy(true);
    try {
      if (kind === 'sticker') {
        await api.deleteSticker();
      } else {
        await api.deleteOutro();
      }
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const hasAny = studio && (studio.sticker || studio.outro);

  return (
    <details className="brand-card">
      <summary>
        🏷️ Ma marque — sticker &amp; outro {hasAny ? '✅' : ''}
        <span className="brand-hint">appliqués automatiquement à tous les épisodes</span>
      </summary>
      <div className="brand-row">
        <div className="brand-item">
          <strong>Sticker (logo)</strong>
          <p className="field-hint">
            Affiché en haut à droite de chaque épisode. PNG transparent recommandé.
          </p>
          {studio?.sticker ? (
            <img className="brand-preview" src={`/studio/${studio.sticker}`} alt="Sticker" />
          ) : (
            <div className="brand-preview empty">Aucun sticker</div>
          )}
          <div className="brand-actions">
            <label className="btn-small upload">
              ⬆️ {studio?.sticker ? 'Changer' : 'Ajouter'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                disabled={busy}
                onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'sticker')}
              />
            </label>
            {studio?.sticker && (
              <button className="btn-small" disabled={busy} onClick={() => remove('sticker')}>
                🗑️ Retirer
              </button>
            )}
          </div>
        </div>
        <div className="brand-item">
          <strong>Outro de fin</strong>
          <p className="field-hint">
            Ta vidéo (ou image) de marque, ajoutée après l'écran « À suivre » de chaque épisode.
            MP4 court conseillé (moins de 30 Mo, 15 s max).
          </p>
          {studio?.outro ? (
            studio.outroIsVideo ? (
              <video
                className="brand-preview"
                src={`/studio/${studio.outro}`}
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img className="brand-preview" src={`/studio/${studio.outro}`} alt="Outro" />
            )
          ) : (
            <div className="brand-preview empty">Aucun outro</div>
          )}
          <div className="brand-actions">
            <label className="btn-small upload">
              ⬆️ {studio?.outro ? 'Changer' : 'Ajouter'}
              <input
                type="file"
                accept="video/mp4,video/quicktime,image/png,image/jpeg,image/webp"
                hidden
                disabled={busy}
                onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'outro')}
              />
            </label>
            {studio?.outro && (
              <button className="btn-small" disabled={busy} onClick={() => remove('outro')}>
                🗑️ Retirer
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="field-hint">
        💡 Ils apparaîtront dans l'aperçu et dans les prochains MP4. Pour les ajouter à un épisode
        déjà produit, rouvre-le et clique « ✅ Valider et produire le MP4 ».
      </p>
    </details>
  );
}

// « Voix françaises » : découverte des meilleures voix NATIVEMENT françaises de
// la bibliothèque ElevenLabs — pré-écoute gratuite, adoption en un clic. Les
// voix adoptées rejoignent le catalogue (casting Claude + menus de voix).
// Test synchro : un SEUL mini-clip (portrait + vidéo 5 s + voix + lèvres)
// pour vérifier toute la chaîne sans produire un épisode. Les fichiers de
// test sont réutilisés : une relance ne repaye que la synchro fal.ai.
// Moteurs de synchro fal.ai comparables depuis la carte de test.
const LIPSYNC_MODELS = [
  { id: '', label: 'sync-lipsync (défaut)' },
  { id: 'veed/lipsync', label: 'VEED lipsync' },
  { id: 'fal-ai/latentsync', label: 'LatentSync' },
];

function SyncTestCard() {
  const [status, setStatus] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState('');

  const refresh = () => api.lipsyncTest().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fresh) => {
    if (
      fresh &&
      !confirm('Tout refaire de zéro ? Le portrait et le clip de test seront regénérés (~40 crédits OpenArt).')
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await api.runLipsyncTest(fresh, model);
      await followJob(jobId, setJob);
    } catch (e) {
      setError(e.message);
    } finally {
      setJob(null);
      setBusy(false);
      refresh();
    }
  };

  const step = (okStep, label) => (
    <span className={okStep ? 'synctest-ok' : 'synctest-todo'}>
      {okStep ? '✅' : '◻️'} {label}
    </span>
  );

  return (
    <details className="brand-card">
      <summary>
        🧪 Test synchro {status?.lastSuccess ? '✅' : ''}
        <span className="brand-hint">
          — vérifie image → clip → voix → lèvres sur UN mini-clip, sans produire d'épisode
        </span>
      </summary>
      <p className="section-label">
        Premier lancement : ~40 crédits OpenArt (portrait + clip 5 s) et ~120 crédits ElevenLabs.
        Les relances réutilisent ces fichiers et ne testent que la synchro fal.ai.
      </p>
      {status && (
        <p className="synctest-steps">
          {step(status.face, 'Portrait')} {step(status.clip, 'Clip vidéo')} {step(status.voice, 'Voix')}{' '}
          {step(status.result, 'Lèvres synchronisées')}
        </p>
      )}
      {busy ? (
        <p className="section-label">
          <span className="spinner small" /> {job?.step || 'Démarrage…'}
        </p>
      ) : (
        <div className="create-actions">
          <button className="btn-primary" onClick={() => run(false)}>
            ▶️ Lancer le test
          </button>
          <select
            className="season-select"
            value={model}
            title="Moteur de synchro à tester — compare-les ici avant de choisir celui des épisodes"
            onChange={(e) => setModel(e.target.value)}
          >
            {LIPSYNC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {status && (status.face || status.clip) && (
            <button className="btn-ghost" onClick={() => run(true)}>
              🔄 Tout refaire de zéro
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {status?.resultUrl && (
        <div className="synctest-result">
          <video src={status.resultUrl} controls playsInline />
          <p className="section-label">
            👄 Regarde et écoute : si les lèvres suivent la voix, toute la chaîne fonctionne — tu
            peux lancer tes épisodes tranquille.
            {status.lastModel ? ` (moteur testé : ${status.lastModel})` : ''}
          </p>
        </div>
      )}
    </details>
  );
}

function FrenchVoicesCard({ voices, onChange }) {
  const [library, setLibrary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const adopted = voices.filter((v) => v.custom);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setLibrary(await api.libraryVoices());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const listen = (url) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => {});
  };

  const adopt = async (v) => {
    setBusy(true);
    setError(null);
    try {
      await api.adoptVoice({
        publicOwnerId: v.publicOwnerId,
        voiceId: v.voiceId,
        name: v.name,
        gender: v.gender,
        desc: v.desc,
      });
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await api.removeCustomVoice(id);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="brand-card">
      <summary>
        🇫🇷 Voix françaises {adopted.length > 0 ? `✅ ${adopted.length}` : ''}
        <span className="brand-hint">
          adopte de vraies voix françaises ElevenLabs — fini l'accent
        </span>
      </summary>
      <p className="field-hint">
        Les voix de base du studio sont anglophones (accent en français). Ici tu pré-écoutes
        gratuitement les meilleures voix <strong>natives françaises</strong> de la bibliothèque
        ElevenLabs et tu les adoptes : elles rejoignent les menus de voix et le casting
        automatique des nouveaux dramas. (Adoption réservée aux plans ElevenLabs payants.)
      </p>

      {adopted.length > 0 && (
        <div className="voice-lib-list">
          {adopted.map((v) => (
            <div key={v.id} className="voice-lib-row adopted">
              <span className="voice-lib-name">
                ✅ {v.name} <em>({v.gender})</em>
              </span>
              <span className="voice-lib-desc">{v.desc}</span>
              <button className="btn-small" disabled={busy} onClick={() => remove(v.id)}>
                🗑️ Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {!library ? (
        <button className="btn-small upload" disabled={busy} onClick={search}>
          {busy ? '⏳ Recherche…' : '🔍 Chercher les meilleures voix françaises'}
        </button>
      ) : (
        <div className="voice-lib-list">
          {library.length === 0 && <p className="field-hint">Aucune voix trouvée.</p>}
          {library.map((v) => {
            const already = voices.some((x) => x.id === v.voiceId);
            return (
              <div key={v.voiceId} className="voice-lib-row">
                <span className="voice-lib-name">
                  {v.gender === 'femme' ? '👩' : '👨'} {v.name} <em>({v.gender})</em>
                </span>
                <span className="voice-lib-desc">{v.desc}</span>
                {v.previewUrl && (
                  <button className="btn-small" onClick={() => listen(v.previewUrl)}>
                    ▶️ Écouter
                  </button>
                )}
                {already ? (
                  <span className="voice-lib-ok">✅ Adoptée</span>
                ) : (
                  <button className="btn-small upload" disabled={busy} onClick={() => adopt(v)}>
                    ➕ Adopter
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}

// Formulaire guidé du mode « mon script » : pose toutes les questions dont la
// suite a besoin (voix = genre/âge, visages constants = apparences, découpage…).
function CustomCreate({ onSubmit, onCancel, busy, mode, seasonEpisodes, onSeasonChange }) {
  const epCount = mode === 'long' ? seasonEpisodes : EPISODE_COUNT;
  const [script, setScript] = useState('');
  const [title, setTitle] = useState('');
  const [setting, setSetting] = useState('');
  const [charactersText, setCharactersText] = useState('');
  const [styles, setStyles] = useState([]);
  const [mustHappen, setMustHappen] = useState('');
  const [fidelity, setFidelity] = useState('fidele');

  const toggleStyle = (id) =>
    setStyles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const ready = script.trim().length >= 30;

  return (
    <section className="create-card custom-form">
      <h2>✍️ Mon propre script</h2>
      <p className="section-label">
        Réponds aux questions ci-dessous : plus tu en dis, plus le drama sera fidèle à ton
        histoire. Seule la première est obligatoire — Claude complète intelligemment le reste,
        et tu valideras tout (scénario puis personnages) avant la production.
      </p>

      {mode === 'long' && (
        <div className="form-field">
          <label>📺 Format long — épisodes dans la saison</label>
          <select value={seasonEpisodes} onChange={(e) => onSeasonChange(Number(e.target.value))}>
            {[30, 40, 50, 60, 70, 80].map((n) => (
              <option key={n} value={n}>
                {n} épisodes de 40 secondes
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-field">
        <label>1. 📖 Raconte ton histoire (obligatoire)</label>
        <p className="field-hint">
          Colle TOUT ce que tu as : script complet avec dialogues, résumé, et même la
          description de tes personnages en tête — l'appli comprend tout et fait le tri.
          C'est la base des {epCount} épisodes.
        </p>
        <textarea
          rows={16}
          value={script}
          maxLength={100000}
          placeholder={
            'Ex. : Aminata, couturière à Abidjan, découvre que son mari Karim a une deuxième famille à Bouaké. Elle décide de se venger en… \n\nOu colle directement ton script :\nAMINATA : Karim, qui est cette femme sur la photo ?\nKARIM : Ce n’est personne, je te jure…'
          }
          onChange={(e) => setScript(e.target.value)}
        />
        <p className="field-hint">
          {script.length.toLocaleString('fr-FR')} / 100 000 caractères
        </p>
      </div>

      <div className="form-field">
        <label>2. ✒️ Tes dialogues : les garder tels quels ?</label>
        <p className="field-hint">
          Le format impose des répliques courtes (18 mots max) pour tenir en 60 secondes par épisode.
        </p>
        <select value={fidelity} onChange={(e) => setFidelity(e.target.value)}>
          <option value="fidele">Garder mes dialogues tels quels autant que possible</option>
          <option value="libre">Claude peut les réécrire pour le format 60 secondes</option>
        </select>
      </div>

      <div className="form-field">
        <label>3. 👥 Tes personnages (recommandé)</label>
        <p className="field-hint">
          Un par ligne : nom, homme/femme, âge, rôle, apparence. Le genre et l'âge servent au
          casting des voix, l'apparence aux visages constants sur toutes les images. Ce qui
          manque sera complété par Claude. Déjà décrits dans ton histoire (question 1) ? Laisse
          vide, c'est compris.
        </p>
        <textarea
          rows={4}
          value={charactersText}
          maxLength={2000}
          placeholder={
            'Ex. :\nAminata — femme, 32 ans, couturière, belle, boubou jaune, tresses\nKarim — homme, 40 ans, commerçant, costume, barbe courte'
          }
          onChange={(e) => setCharactersText(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>4. 🏷️ Le titre (optionnel)</label>
        <input
          value={title}
          maxLength={120}
          placeholder="Laisse vide pour que Claude en propose un"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>5. 📍 Où et quand se passe l'histoire ? (optionnel)</label>
        <p className="field-hint">Ville, pays, quartier, époque — ça guide les décors des images.</p>
        <input
          value={setting}
          maxLength={300}
          placeholder="Ex. : Abidjan, quartier de Cocody, de nos jours"
          onChange={(e) => setSetting(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>6. 🎭 Le ton (optionnel, 3 max)</label>
        <StylePicker selected={styles} onToggle={(id) => (styles.includes(id) || styles.length < MAX_STYLES) && toggleStyle(id)} />
      </div>

      <div className="form-field">
        <label>7. 🔥 Ce qui doit absolument arriver (optionnel)</label>
        <p className="field-hint">
          Les moments clés, les révélations, la fin de la saison — ils seront respectés au fil
          des {epCount} épisodes.
        </p>
        <textarea
          rows={3}
          value={mustHappen}
          maxLength={1000}
          placeholder="Ex. : Aminata découvre la vérité à l'épisode 5, et à la fin c'est elle qui garde la boutique"
          onChange={(e) => setMustHappen(e.target.value)}
        />
      </div>

      <div className="review-actions">
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>
          ← Retour
        </button>
        <button
          className="btn-primary"
          disabled={busy || !ready}
          title={ready ? '' : "Raconte d'abord ton histoire (question 1)"}
          onClick={() =>
            onSubmit({ script, title, setting, charactersText, styles, mustHappen, fidelity })
          }
        >
          🎬 Créer mon drama depuis ce script
        </button>
      </div>
      {!ready && script.length > 0 && (
        <p className="field-hint">Encore quelques phrases : l'histoire est trop courte pour démarrer.</p>
      )}
    </section>
  );
}

function CreationProgress({ job, error, onBack }) {
  return (
    <div className="progress-panel">
      <div className="spinner" />
      <h2>Création en cours…</h2>
      <p className="progress-step">{job?.step || 'Démarrage…'}</p>
      {job?.progress != null && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Claude écrit le scénario complet (1 à 3 minutes). Ensuite tu pourras le valider ou le
        régénérer, puis valider les visages des personnages, avant de produire l'épisode 1.
      </p>
      {onBack && (
        <button className="btn-ghost" onClick={onBack}>
          ← Retour à l'accueil (la création continue en arrière-plan)
        </button>
      )}
    </div>
  );
}

// Les anciens dramas « Version Synchro » (entrée retirée du menu) restent
// accessibles dans la liste de la Version normale.
const homeMode = (p) => (p.mode === 'synchro' ? 'normal' : p.mode || 'normal');

// Écran d'entrée : la Version normale (voix off + sous-titres), le Format
// long façon DramaWave (tout vidéo, lèvres animées via fal.ai), les Chaînes.
function ModeGate({ onPick }) {
  return (
    <div className="page centered">
      <header className="home-header">
        <h1>Drama Studio</h1>
        <p className="tagline">Choisis ta version pour cette session.</p>
      </header>
      <div className="mode-gate">
        <button className="mode-card" onClick={() => onPick('normal')}>
          <span className="mode-emoji">🎬</span>
          <strong>Version normale</strong>
          <span className="mode-desc">
            Comme d'habitude : voix off + sous-titres, bouches immobiles dans les clips. Épisodes
            rangés dans <strong>Dramas</strong>.
          </span>
        </button>
        <button className="mode-card" onClick={() => onPick('long')}>
          <span className="mode-emoji">📺</span>
          <strong>Format long</strong>
          <span className="mode-desc">
            Le format DramaWave : épisodes de 40 secondes, saisons de 30 à 80 épisodes,{' '}
            <strong>tout en vidéo</strong> avec les lèvres animées sur les voix (fal.ai).
            Épisodes rangés dans <strong>Dramas Long</strong>.
          </span>
        </button>
        <button className="mode-card" onClick={() => onPick('chaine')}>
          <span className="mode-emoji">🎥</span>
          <strong>Chaînes</strong>
          <span className="mode-desc">
            Hors dramas : vidéos de 1 à 2 minutes racontées par un narrateur (storytime,
            éducatif, tops…). Chaque chaîne a son style, sa voix et son dossier iCloud.
          </span>
        </button>
      </div>
    </div>
  );
}

// Création d'une chaîne : identité fixe (nom, genre, thème, style, durée, voix).
function ChannelCreate({ onSubmit, error, voices = VOICES }) {
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('storytime');
  const [themeDesc, setThemeDesc] = useState('');
  const [visualStyle, setVisualStyle] = useState('photorealiste');
  const [targetSeconds, setTargetSeconds] = useState(90);
  const [narratorVoice, setNarratorVoice] = useState('onwK4e9ZLuTAKqWW03F9');

  return (
    <section className="create-card custom-form">
      <h2>➕ Nouvelle chaîne</h2>
      <p className="section-label">
        Une chaîne fixe une identité — son nom, son thème, son style d'images, sa voix — puis tu
        enchaînes les vidéos dedans, sujet par sujet. Le nom de la chaîne devient le nom de son
        dossier iCloud.
      </p>
      <div className="form-field">
        <label>1. 🏷️ Nom de la chaîne (obligatoire)</label>
        <input
          value={name}
          maxLength={80}
          placeholder="Ex. : Histoires Vraies d'Afrique"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>2. 🎭 Genre</label>
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="storytime">📖 Storytime — histoires et faits réels</option>
          <option value="educatif">🎓 Éducatif — conseils pratiques</option>
          <option value="classement">🏆 Classements — tops</option>
        </select>
      </div>
      <div className="form-field">
        <label>3. 🧭 Le thème de la chaîne, en une phrase</label>
        <p className="field-hint">
          C'est la ligne éditoriale : tous les sujets proposés et tous les scripts la suivront.
        </p>
        <input
          value={themeDesc}
          maxLength={300}
          placeholder="Ex. : les grandes histoires vraies et destins incroyables d'Afrique"
          onChange={(e) => setThemeDesc(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>4. 🎨 Style des images</label>
        <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)}>
          <option value="photorealiste">📷 Photoréaliste (comme les dramas)</option>
          <option value="illustration">🖌️ Illustration moderne</option>
          <option value="archives">🎞️ Style archives / sépia</option>
          <option value="epure">◻️ Épuré / minimaliste</option>
        </select>
      </div>
      <div className="form-field">
        <label>5. ⏱️ Durée des vidéos</label>
        <select value={targetSeconds} onChange={(e) => setTargetSeconds(Number(e.target.value))}>
          {[60, 75, 90, 105, 120].map((s) => (
            <option key={s} value={s}>
              {s} secondes {s === 90 ? '(recommandé)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>6. 🎙️ La voix du narrateur</label>
        <p className="field-hint">
          C'est l'identité sonore de la chaîne — la même voix sur toutes les vidéos (modifiable
          ensuite, avec pré-écoute, dans la chaîne).
        </p>
        <select value={narratorVoice} onChange={(e) => setNarratorVoice(e.target.value)}>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              🎙️ {v.name} — {v.desc}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <button
        className="btn-primary"
        disabled={name.trim().length < 2}
        onClick={() =>
          onSubmit({ name: name.trim(), genre, themeDesc, visualStyle, targetSeconds, narratorVoice })
        }
      >
        🎥 Créer la chaîne
      </button>
    </section>
  );
}

export function App() {
  const [mode, setMode] = useState(null);
  const [view, setView] = useState({ name: 'home' });
  const [projects, setProjects] = useState([]);
  const [health, setHealth] = useState(null);
  const [credits, setCredits] = useState(null);
  const [studio, setStudio] = useState(null);
  const [selected, setSelected] = useState([]);
  const [theme, setTheme] = useState('');
  const [seasonEpisodes, setSeasonEpisodes] = useState(40);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [voicesCatalog, setVoicesCatalog] = useState(VOICES);
  const leftCreation = useRef(false);

  const refresh = () => api.listProjects().then(setProjects).catch(() => {});

  const refreshStudio = () => api.getStudio().then(setStudio).catch(() => {});

  const refreshVoices = () => api.voices().then(setVoicesCatalog).catch(() => {});

  useEffect(() => {
    refresh();
    api.health().then(setHealth).catch(() => {});
    api.credits().then(setCredits).catch(() => {});
    refreshStudio();
    refreshVoices();
  }, []);

  // Suivi des productions en cours sur l'accueil (toutes les 3 s).
  useEffect(() => {
    if (!mode || view.name !== 'home') {
      return undefined;
    }
    let prevCount = -1;
    const tick = () =>
      api
        .activeJobs()
        .then((jobs) => {
          setActiveJobs(jobs);
          // Un job vient de se terminer → la liste des dramas a pu changer.
          if (prevCount !== -1 && jobs.length < prevCount) {
            refresh();
          }
          prevCount = jobs.length;
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, [mode, view.name]);

  const toggleStyle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const runCreation = async (kickoff, backTo = 'home') => {
    setError(null);
    leftCreation.current = false;
    setView({ name: 'creating' });
    try {
      const { jobId } = await kickoff();
      const done = await followJob(jobId, setJob);
      await refresh();
      // Si l'utilisateur est reparti à l'accueil, on ne le téléporte pas.
      if (!leftCreation.current) {
        setView({ name: 'project', id: done.result.projectId });
      }
    } catch (e) {
      setError(e.message);
      if (!leftCreation.current) {
        setTimeout(() => setView({ name: backTo }), 100);
      }
    } finally {
      setJob(null);
    }
  };

  const create = () =>
    runCreation(() => api.createProject(selected, theme, mode, seasonEpisodes));
  const createCustom = (answers) =>
    runCreation(
      () => api.createCustomProject({ ...answers, mode, episodeCount: seasonEpisodes }),
      'custom',
    );

  if (!mode) {
    return <ModeGate onPick={setMode} />;
  }

  if (view.name === 'project') {
    return (
      <ProjectView
        projectId={view.id}
        onBack={() => {
          refresh();
          setView({ name: 'home' });
        }}
      />
    );
  }

  if (view.name === 'creating') {
    return (
      <div className="page centered">
        <CreationProgress
          job={job}
          error={error}
          onBack={() => {
            leftCreation.current = true;
            setView({ name: 'home' });
          }}
        />
      </div>
    );
  }

  if (view.name === 'custom') {
    return (
      <div className="page">
        <header className="home-header">
          <h1>Drama Studio</h1>
          <p className="tagline">Ton histoire, notre production — {EPISODE_COUNT} épisodes de 60 secondes.</p>
        </header>
        {error && <div className="banner warn">{error}</div>}
        <CustomCreate
          busy={false}
          mode={mode}
          seasonEpisodes={seasonEpisodes}
          onSeasonChange={setSeasonEpisodes}
          onSubmit={createCustom}
          onCancel={() => {
            setError(null);
            setView({ name: 'home' });
          }}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="home-header">
        <h1>Drama Studio</h1>
        <p className="tagline">Micro-dramas africains — 10 épisodes de 60 secondes, générés chez toi.</p>
        <p className="mode-line">
          {mode === 'long'
            ? '📺 Format long (40 s, tout vidéo + lèvres animées)'
            : mode === 'chaine'
              ? '🎥 Chaînes (vidéos 1-2 min, narrateur)'
              : '🎬 Version normale'}
          <button className="btn-small" onClick={() => setMode(null)}>
            ↔ Changer de version
          </button>
        </p>
      </header>

      {mode === 'long' && health && !health.fal && (
        <div className="banner warn">
          🗣️ Le Format long anime les lèvres sur les voix via fal.ai : crée un compte sur
          fal.ai, puis ajoute <code>FAL_KEY=...</code> dans le fichier <code>.env</code> et
          relance. Sans clé, les dramas se créent normalement mais la synchro labiale échouera.
        </div>
      )}

      {health && !health.claude && (
        <div className="banner warn">
          ⚠️ La commande <code>claude</code> est introuvable. Installe Claude Code et connecte-toi
          (<code>npm i -g @anthropic-ai/claude-code</code> puis <code>claude</code> → <code>/login</code>).
        </div>
      )}
      {health && health.imageProvider === 'manual' && (
        <div className="banner info">
          🖼️ Mode images manuel (OpenArt) : les scènes seront créées sans images — copie chaque
          prompt dans OpenArt puis dépose l'image dans la scène.
        </div>
      )}
      {health && (
        <p className="provider-line">
          Images : <strong>{health.imageProvider}</strong>
          {health.imageProvider === 'openart' && ' (visages constants + 3 scènes vidéo par épisode)'}
          {' · '}Voix : <strong>{health.tts}</strong>
        </p>
      )}
      {credits &&
        (credits.openart?.credits != null || credits.elevenlabs?.limit != null) && (
          <p className="provider-line">
            💰 Il te reste :{' '}
            {credits.openart?.credits != null && (
              <>
                OpenArt <strong>{Number(credits.openart.credits).toLocaleString('fr-FR')}</strong>{' '}
                crédits
              </>
            )}
            {credits.openart?.credits != null && credits.elevenlabs?.limit != null && ' · '}
            {credits.elevenlabs?.limit != null && (
              <>
                ElevenLabs{' '}
                <strong>
                  {Math.max(
                    0,
                    credits.elevenlabs.limit - credits.elevenlabs.used,
                  ).toLocaleString('fr-FR')}
                </strong>{' '}
                crédits
              </>
            )}
          </p>
        )}

      {activeJobs.length > 0 && (
        <section className="active-jobs">
          <h2>🏭 Productions en cours</h2>
          {activeJobs.map((j) => (
            <div
              key={j.id}
              className="active-job"
              title="Cliquer pour ouvrir ce drama"
              onClick={() => j.projectId && setView({ name: 'project', id: j.projectId })}
            >
              <div className="aj-head">
                <strong>{j.projectTitle || 'Nouveau drama'}</strong>
                {j.mode === 'synchro' && <span className="scene-badge">🗣️ Synchro</span>}
                <span className="aj-label">{j.label}</span>
              </div>
              <div className="aj-step">
                <span className="spinner small" />
                {j.step || 'Démarrage…'}
                {j.progress != null && ` — ${Math.round(j.progress * 100)} %`}
              </div>
              {j.progress != null && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round(j.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {mode === 'chaine' ? (
        <ChannelCreate
          error={error}
          voices={voicesCatalog}
          onSubmit={(info) => runCreation(() => api.createChannel(info))}
        />
      ) : (
      <section className="create-card">
        <h2>Nouveau drama</h2>
        <p className="section-label">
          Choisis 1 à {MAX_STYLES} styles ({selected.length} sélectionné{selected.length > 1 ? 's' : ''})
        </p>
        <StylePicker selected={selected} onToggle={toggleStyle} />
        {mode === 'long' && (
          <p className="section-label" style={{ marginTop: 14 }}>
            📺 Épisodes dans la saison :{' '}
            <select
              className="season-select"
              value={seasonEpisodes}
              onChange={(e) => setSeasonEpisodes(Number(e.target.value))}
            >
              {[30, 40, 50, 60, 70, 80].map((n) => (
                <option key={n} value={n}>
                  {n} épisodes
                </option>
              ))}
            </select>{' '}
            de 40 secondes
          </p>
        )}
        <input
          className="theme-input"
          placeholder="Idée ou thème (optionnel) — ex. « une veuve découvre le secret de son mari »"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          maxLength={300}
        />
        {error && <p className="error">{error}</p>}
        <div className="create-actions">
          <button className="btn-primary" disabled={selected.length === 0} onClick={create}>
            🎬 Créer mon drama
          </button>
          <button
            className="btn-ghost"
            title="Tu as déjà ton histoire ou ton script ? Le formulaire pose les bonnes questions et Claude le met en forme fidèlement."
            onClick={() => {
              setError(null);
              setView({ name: 'custom' });
            }}
          >
            ✍️ J'ai déjà mon script
          </button>
        </div>
      </section>
      )}

      <BrandCard studio={studio} onChange={refreshStudio} />

      <FrenchVoicesCard voices={voicesCatalog} onChange={refreshVoices} />

      <SyncTestCard />

      {projects.filter((p) => homeMode(p) === mode).length > 0 && (
        <section className="library">
          <h2>
            {mode === 'chaine' ? 'Mes chaînes' : `Mes dramas ${mode === 'long' ? 'Format long' : ''}`}
          </h2>
          <div className="project-grid">
            {projects.filter((p) => homeMode(p) === mode).map((p) => (
              <div key={p.id} className="project-card" onClick={() => setView({ name: 'project', id: p.id })}>
                <h3>{p.title}</h3>
                <p className="logline">{p.logline}</p>
                <div className="badges">
                  {p.custom && <span className="badge">✍️ Mon script</span>}
                  {p.mode === 'synchro' && <span className="badge">🗣️ Synchro</span>}
                  {(p.styles || []).map((s) => {
                    const st = STYLES.find((x) => x.id === s);
                    return (
                      <span key={s} className="badge">
                        {st ? `${st.emoji} ${st.label}` : s}
                      </span>
                    );
                  })}
                </div>
                {(() => {
                  if (p.stage === 'script_review') {
                    return <p className="ep-count stage">📝 Scénario à valider</p>;
                  }
                  if (p.stage === 'characters_review') {
                    return <p className="ep-count stage">👥 Personnages à valider</p>;
                  }
                  const eps = p.episodes || [];
                  const produced = eps.filter((e) => e.status === 'ready' || e.status === 'done').length;
                  const mp4 = eps.filter((e) => e.rendered).length;
                  if (p.mode === 'chaine') {
                    return (
                      <p className="ep-count">
                        {eps.length} vidéo{eps.length > 1 ? 's' : ''}
                        {mp4 > 0 ? ` · ${mp4} MP4 prêt${mp4 > 1 ? 's' : ''}` : ''}
                      </p>
                    );
                  }
                  return (
                    <p className="ep-count">
                      {produced} / {p.episodeCount || EPISODE_COUNT} épisodes produits
                      {mp4 > 0 ? ` · ${mp4} MP4 prêt${mp4 > 1 ? 's' : ''}` : ''}
                    </p>
                  );
                })()}
                <button
                  className="btn-ghost danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Supprimer « ${p.title} » ?`)) {
                      api.deleteProject(p.id).then(refresh);
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
