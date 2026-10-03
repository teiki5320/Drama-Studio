// Formulaires et cartes réutilisés par les pages du studio (Shell.jsx) :
// ma marque, voix françaises, fiche d'une appli, création d'une chaîne.
import React, { useEffect, useRef, useState } from 'react';
import { VOICES } from '../shared/catalog.js';
import { api, fileToDataUrl } from './api.js';

// « Ma marque » : sticker (logo) et outro perso, appliqués à tous les épisodes.
export function BrandCard({ studio, onChange }) {
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
        déjà produit, rouvre-le et clique « 🎞️ Monter le MP4 final ».
      </p>
    </details>
  );
}

// « Voix françaises » : découverte des meilleures voix NATIVEMENT françaises de
// la bibliothèque ElevenLabs — pré-écoute gratuite, adoption en un clic. Les
// voix adoptées rejoignent le catalogue (casting Claude + menus de voix).
export function FrenchVoicesCard({ voices, onChange }) {
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

// Création d'une APPLI à promouvoir : son identité commerciale (ce qu'elle
// fait, pour qui, ce qu'elle propose, l'appel à l'action). Ensuite, dans
// l'appli, on enchaîne autant de pubs que d'angles à tester.
export function AppCreate({ onSubmit, error, voices = VOICES }) {
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [platform, setPlatform] = useState('iOS');
  const [audience, setAudience] = useState('');
  const [features, setFeatures] = useState('');
  const [tone, setTone] = useState('probleme');
  const [cta, setCta] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [visualStyle, setVisualStyle] = useState('photorealiste');
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [narratorVoice, setNarratorVoice] = useState('onwK4e9ZLuTAKqWW03F9');

  // Remplissage depuis un dépôt GitHub : on choisit, Claude lit le README.
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState('');
  const [reposError, setReposError] = useState('');
  const [reposLoading, setReposLoading] = useState(true);
  const [siteUrl, setSiteUrl] = useState('');
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefInfo, setBriefInfo] = useState('');
  const [briefError, setBriefError] = useState('');

  // fresh = true : ignore le cache du serveur (bouton « Recharger »).
  const loadRepos = (fresh, isAlive = () => true) => {
    setReposLoading(true);
    setReposError('');
    api
      .githubRepos(fresh)
      .then((d) => isAlive() && setRepos(d.repos || []))
      .catch((e) => isAlive() && setReposError(e.message))
      .finally(() => isAlive() && setReposLoading(false));
  };

  useEffect(() => {
    let alive = true;
    loadRepos(false, () => alive);
    return () => {
      alive = false;
    };
  }, []);

  // fetchBrief : lecture d'un dépôt GitHub ou d'un site — même fiche en retour.
  const fillFrom = async (fetchBrief) => {
    setBriefBusy(true);
    setBriefError('');
    setBriefInfo('');
    try {
      const d = await fetchBrief();
      const f = d.fields || {};
      // On ne remplace que ce que Claude a su remplir : ce que tu as déjà tapé
      // reste — y compris ce que tu as tapé PENDANT la lecture du README.
      const fill = (value, set) => {
        if (value) {
          set((current) => (current.trim() ? current : value));
        }
      };
      fill(f.name, setName);
      fill(f.pitch, setPitch);
      fill(f.audience, setAudience);
      fill(f.features, setFeatures);
      fill(f.cta, setCta);
      fill(f.storeUrl, setStoreUrl);
      if (f.platform && /android/i.test(f.platform) && !/ios/i.test(f.platform)) {
        setPlatform('Android');
      } else if (f.platform && /ios|iphone/i.test(f.platform)) {
        setPlatform(/android/i.test(f.platform) ? 'iOS et Android' : 'iOS');
      }
      setBriefInfo(
        [
          `✅ Fiche remplie depuis ${d.repo}.`,
          d.hadReadme ? '' : ' (peu de texte à lire : la fiche risque d’être maigre)',
          d.notes ? ` À compléter : ${d.notes}` : '',
          ' Relis tout avant de valider.',
        ].join(''),
      );
    } catch (e) {
      setBriefError(e.message);
    } finally {
      setBriefBusy(false);
    }
  };

  return (
    <section className="create-card custom-form">
      <h2>➕ Nouvelle appli</h2>
      <p className="section-label">
        Décris ton appli une seule fois : Claude s'en sert ensuite pour écrire autant de pubs que
        tu veux, chacune sous un angle différent. Tu pourras ajouter tes captures d'écran juste
        après — elles sont insérées telles quelles dans les vidéos (aucun crédit).
      </p>
      <div className="form-field">
        <label>🐙 Partir d'un dépôt GitHub ou d'un site (raccourci)</label>
        <p className="field-hint">
          Choisis le dépôt de l'appli, ou colle l'adresse de son site : Claude le lit et
          remplit les questions ci-dessous. Il ne touche pas aux champs que tu as déjà remplis, et n'invente aucun
          chiffre — relis avant de valider.
        </p>
        {reposError ? (
          <p className="field-hint">
            ⚠️ Dépôts illisibles : {reposError} — remplis à la main, ou{' '}
            <button className="btn-small" onClick={() => loadRepos(true)}>
              🔄 Réessayer
            </button>
          </p>
        ) : (
          <div className="topic-bar">
            <select
              className="season-select"
              value={repo}
              disabled={briefBusy}
              onChange={(e) => setRepo(e.target.value)}
            >
              <option value="">
                {reposLoading
                  ? 'chargement des dépôts…'
                  : repos.length
                    ? '— choisis un dépôt —'
                    : 'aucun dépôt trouvé sur ce compte'}
              </option>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.private ? '🔒 ' : ''}
                  {r.label}
                  {r.description ? ` — ${r.description.slice(0, 60)}` : ''}
                </option>
              ))}
            </select>
            <button
              className="btn-small"
              disabled={reposLoading || briefBusy}
              title="Recharger la liste des dépôts"
              onClick={() => loadRepos(true)}
            >
              🔄
            </button>
            <button
              className="btn-small"
              disabled={!repo || briefBusy}
              onClick={() => fillFrom(() => api.repoBrief(repo))}
            >
              {briefBusy ? '⏳ Lecture…' : '✨ Remplir la fiche'}
            </button>
          </div>
        )}
        <div className="topic-bar" style={{ marginTop: 8 }}>
          <input
            value={siteUrl}
            disabled={briefBusy}
            placeholder="ou l'adresse d'un site — ex. : keurcook.com"
            onChange={(e) => setSiteUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn-small"
            disabled={siteUrl.trim().length < 4 || briefBusy}
            onClick={() => fillFrom(() => api.siteBrief(siteUrl.trim()))}
          >
            {briefBusy ? '⏳ Lecture…' : '🌐 Lire le site'}
          </button>
        </div>
        {briefInfo && <p className="field-hint">{briefInfo}</p>}
        {briefError && <p className="error">{briefError}</p>}
      </div>
      <div className="form-field">
        <label>1. 📱 Nom de l'appli (obligatoire)</label>
        <input
          value={name}
          maxLength={80}
          placeholder="Ex. : Erea"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>2. 💡 Ce qu'elle fait, en une phrase (obligatoire)</label>
        <p className="field-hint">Comme si tu l'expliquais à un ami — le bénéfice, pas la technique.</p>
        <input
          value={pitch}
          maxLength={400}
          placeholder="Ex. : un jeu de culture historique où l'on place les événements sur une grande frise du temps"
          onChange={(e) => setPitch(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>3. 🎯 À qui elle s'adresse</label>
        <input
          value={audience}
          maxLength={200}
          placeholder="Ex. : familles, curieux d'histoire, joueurs de quiz de 15 à 60 ans"
          onChange={(e) => setAudience(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>4. ✨ Ce qu'elle propose (une ligne par élément)</label>
        <p className="field-hint">
          Modes de jeu, fonctions clés, chiffres réels… Claude y pioche des arguments concrets —
          il n'invente rien d'autre.
        </p>
        <textarea
          rows={5}
          value={features}
          maxLength={800}
          placeholder={'Défi du jour : 10 mêmes questions pour tout le monde\nMode Chrono : 10 secondes par question\n1 738 événements vérifiés\nClassements mondiaux Game Center'}
          onChange={(e) => setFeatures(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>5. 🎭 Ton des pubs</label>
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="probleme">😤 Problème → solution</option>
          <option value="temoignage">🗣️ Témoignage</option>
          <option value="demo">📲 Démo de l'appli</option>
          <option value="punchy">⚡ Punchy / rythme TikTok</option>
          <option value="storytelling">📖 Mini-histoire</option>
        </select>
      </div>
      <div className="form-field">
        <label>6. 📣 Appel à l'action final</label>
        <input
          value={cta}
          maxLength={120}
          placeholder={name ? `Télécharge ${name} sur l'App Store` : "Télécharge l'appli sur l'App Store"}
          onChange={(e) => setCta(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>7. 🎨 Style des images générées</label>
        <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)}>
          <option value="photorealiste">📷 Photoréaliste</option>
          <option value="illustration">🖌️ Illustration moderne</option>
          <option value="archives">🎞️ Style archives / sépia</option>
          <option value="epure">◻️ Épuré / minimaliste</option>
        </select>
      </div>
      <div className="form-field">
        <label>8. ⏱️ Durée des pubs</label>
        <select value={targetSeconds} onChange={(e) => setTargetSeconds(Number(e.target.value))}>
          {[30, 40, 45, 50, 60].map((sec) => (
            <option key={sec} value={sec}>
              {sec} secondes {sec === 30 ? '(recommandé)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>9. 🎙️ La voix des pubs</label>
        <select value={narratorVoice} onChange={(e) => setNarratorVoice(e.target.value)}>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              🎙️ {v.name} — {v.desc}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>10. 🔗 Lien de la fiche (optionnel)</label>
        <input
          value={storeUrl}
          maxLength={300}
          placeholder="https://apps.apple.com/…"
          onChange={(e) => setStoreUrl(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button
        className="btn-primary"
        disabled={name.trim().length < 2 || pitch.trim().length < 10}
        onClick={() =>
          onSubmit({
            name: name.trim(),
            pitch: pitch.trim(),
            platform,
            audience: audience.trim(),
            features,
            tone,
            cta: cta.trim(),
            storeUrl: storeUrl.trim(),
            visualStyle,
            targetSeconds,
            narratorVoice,
          })
        }
      >
        📱 Ajouter l'appli
      </button>
    </section>
  );
}

// Création d'une chaîne : identité fixe (nom, genre, thème, style, durée, voix).
export function ChannelCreate({ onSubmit, error, voices = VOICES }) {
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

