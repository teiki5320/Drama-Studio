// ---------- Dépôts GitHub ----------
// L'onglet Publicité part d'un dépôt : on liste les dépôts du compte, puis on
// lit la description, les sujets et le README de celui qu'on choisit. Claude
// s'en sert pour remplir la fiche de l'appli à la place de l'auteur.
//
// Compte réglable : GITHUB_USER dans .env (défaut « teiki5320 »).
// Dépôts privés : GITHUB_TOKEN (jeton à portée « repo », lecture seule suffit).
// Sans jeton, l'API publique autorise 60 appels par heure — d'où le cache.

const DEFAULT_USER = 'teiki5320';
const API = 'https://api.github.com';
const LIST_TTL_MS = 5 * 60 * 1000;

let listCache = null; // { user, at, repos }

export function githubUser() {
  return (process.env.GITHUB_USER || DEFAULT_USER).trim().replace(/^@/, '');
}

function githubToken() {
  return (process.env.GITHUB_TOKEN || '').trim();
}

async function callGithub(pathname, { accept = 'application/vnd.github+json', label } = {}) {
  const headers = {
    Accept: accept,
    'User-Agent': 'DramaStudio/1.0 (publicite)',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = githubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${API}${pathname}`, { headers, signal: ctrl.signal });
    if (res.status === 404) {
      throw new Error(`${label} est introuvable (dépôt privé sans jeton, ou nom incorrect).`);
    }
    if (res.status === 401 || res.status === 403) {
      const left = res.headers.get('x-ratelimit-remaining');
      if (left === '0') {
        throw new Error(
          "Trop d'appels à GitHub pour l'instant (60 par heure sans jeton). " +
            'Réessaie dans quelques minutes, ou ajoute GITHUB_TOKEN dans .env.',
        );
      }
      throw new Error(`GitHub a refusé l'accès à ${label} (jeton absent ou insuffisant).`);
    }
    if (!res.ok) {
      throw new Error(`GitHub a répondu ${res.status} pour ${label}.`);
    }
    return accept.includes('raw') ? await res.text() : await res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`GitHub n'a pas répondu à temps pour ${label}.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// « kultiva-prix » → « Kultiva prix » : un nom présentable par défaut.
export function labelFromRepo(name) {
  const s = String(name || '').replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// La liste proposée dans le menu déroulant. Avec un jeton on voit aussi les
// dépôts privés ; sans jeton, les publics du compte.
export async function listRepos({ fresh = false } = {}) {
  const user = githubUser();
  if (!fresh && listCache && listCache.user === user && Date.now() - listCache.at < LIST_TTL_MS) {
    return { user, repos: listCache.repos, cached: true };
  }
  const path = githubToken()
    ? '/user/repos?per_page=100&sort=updated&affiliation=owner'
    : `/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`;
  const raw = await callGithub(path, { label: 'la liste des dépôts' });
  const repos = (Array.isArray(raw) ? raw : [])
    .filter((r) => r && r.name && !r.fork && !r.archived)
    .map((r) => ({
      name: r.name,
      fullName: r.full_name,
      label: labelFromRepo(r.name),
      description: String(r.description || '').trim(),
      private: Boolean(r.private),
      homepage: String(r.homepage || '').trim(),
      language: r.language || '',
      updatedAt: r.pushed_at || r.updated_at || '',
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  listCache = { user, at: Date.now(), repos };
  return { user, repos, cached: false };
}

function ownerRepo(fullName) {
  const s = String(fullName || '').trim().replace(/^https?:\/\/github\.com\//i, '');
  const m = s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (m) {
    return `${m[1]}/${m[2]}`;
  }
  if (/^[\w.-]+$/.test(s)) {
    return `${githubUser()}/${s}`;
  }
  throw new Error('Nom de dépôt invalide.');
}

// Tout ce qu'on peut lire d'un dépôt sans le cloner : la fiche, les sujets et
// le README. Le README est tronqué — Claude n'a pas besoin de tout.
export async function fetchRepoBrief(fullNameOrName, { readmeChars = 9000 } = {}) {
  const full = ownerRepo(fullNameOrName);
  const meta = await callGithub(`/repos/${full}`, { label: `le dépôt ${full}` });
  let readme = '';
  try {
    readme = await callGithub(`/repos/${full}/readme`, {
      accept: 'application/vnd.github.raw',
      label: `le README de ${full}`,
    });
  } catch {
    readme = ''; // Un dépôt sans README reste exploitable : description + sujets.
  }
  return {
    fullName: meta.full_name || full,
    name: meta.name || full.split('/')[1],
    label: labelFromRepo(meta.name || full.split('/')[1]),
    description: String(meta.description || '').trim(),
    topics: Array.isArray(meta.topics) ? meta.topics.slice(0, 20) : [],
    homepage: String(meta.homepage || '').trim(),
    language: meta.language || '',
    url: meta.html_url || `https://github.com/${full}`,
    readme: String(readme || '').slice(0, readmeChars),
  };
}
