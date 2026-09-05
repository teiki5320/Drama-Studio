async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  credits: () => request('/api/credits'),
  listProjects: () => request('/api/projects'),
  getProject: (id) => request(`/api/projects/${id}`),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  patchProject: (id, patch) =>
    request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createProject: (styles, theme, mode, episodeCount) =>
    request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ styles, theme, mode, episodeCount }),
    }),
  createCustomProject: (answers) =>
    request('/api/projects/custom', { method: 'POST', body: JSON.stringify(answers) }),
  createChannel: (info) =>
    request('/api/projects/channel', { method: 'POST', body: JSON.stringify(info) }),
  createChannelVideo: (id, topic) =>
    request(`/api/projects/${id}/videos`, { method: 'POST', body: JSON.stringify({ topic }) }),
  suggestTopics: (id) => request(`/api/projects/${id}/suggest-topics`, { method: 'POST' }),
  uploadChannelOutro: (id, dataUrl) =>
    request(`/api/projects/${id}/channel-outro`, {
      method: 'POST',
      body: JSON.stringify({ data: dataUrl }),
    }),
  deleteChannelOutro: (id) =>
    request(`/api/projects/${id}/channel-outro`, { method: 'DELETE' }),
  produceEpisode: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}/produce`, { method: 'POST' }),
  deleteEpisode: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}`, { method: 'DELETE' }),
  produceSeason: (id, count) =>
    request(`/api/projects/${id}/produce-season`, {
      method: 'POST',
      body: JSON.stringify(count ? { count } : {}),
    }),
  activeJob: (id) => request(`/api/projects/${id}/active-job`),
  activeJobs: () => request('/api/active-jobs'),
  renderEpisode: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}/render`, { method: 'POST' }),
  regenAllImages: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}/regen-images`, { method: 'POST' }),
  retryAssets: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}/retry-assets`, { method: 'POST' }),
  regenPortrait: (id, charId) =>
    request(`/api/projects/${id}/characters/${charId}/portrait`, { method: 'POST' }),
  patchCharacter: (id, charId, patch) =>
    request(`/api/projects/${id}/characters/${charId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  voicePreview: (id, charId, elevenVoice) =>
    request(`/api/projects/${id}/characters/${charId}/voice-preview`, {
      method: 'POST',
      body: JSON.stringify({ elevenVoice }),
    }),
  newFace: (id, charId, instructions) =>
    request(`/api/projects/${id}/characters/${charId}/new-face`, {
      method: 'POST',
      body: JSON.stringify({ instructions }),
    }),
  reviewCharacters: (id) =>
    request(`/api/projects/${id}/review-characters`, { method: 'POST' }),
  regenScript: (id) => request(`/api/projects/${id}/regen-script`, { method: 'POST' }),
  validateScript: (id) => request(`/api/projects/${id}/validate-script`, { method: 'POST' }),
  generatePortraits: (id) => request(`/api/projects/${id}/portraits`, { method: 'POST' }),
  validateCharacters: (id) =>
    request(`/api/projects/${id}/validate-characters`, { method: 'POST' }),
  regenAllAudio: (id, n) =>
    request(`/api/projects/${id}/episodes/${n}/regen-audio`, { method: 'POST' }),
  patchScene: (id, n, sceneId, patch) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  regenImage: (id, n, sceneId, imagePrompt) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/image`, {
      method: 'POST',
      body: JSON.stringify({ imagePrompt }),
    }),
  regenAudio: (id, n, sceneId) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/audio`, { method: 'POST' }),
  regenVideo: (id, n, sceneId) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/video`, { method: 'POST' }),
  lipsyncScene: (id, n, sceneId) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/lipsync`, { method: 'POST' }),
  removeVideo: (id, n, sceneId) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/video`, { method: 'DELETE' }),
  uploadSceneImage: (id, n, sceneId, dataUrl) =>
    request(`/api/projects/${id}/episodes/${n}/scenes/${sceneId}/upload-image`, {
      method: 'POST',
      body: JSON.stringify({ data: dataUrl }),
    }),
  uploadMusic: (id, dataUrl) =>
    request(`/api/projects/${id}/music`, {
      method: 'POST',
      body: JSON.stringify({ data: dataUrl }),
    }),
  openFolder: (id) => request(`/api/projects/${id}/open-folder`, { method: 'POST' }),
  voices: () => request('/api/voices'),
  libraryVoices: () => request('/api/voices/library'),
  adoptVoice: (voice) =>
    request('/api/voices/adopt', { method: 'POST', body: JSON.stringify(voice) }),
  removeCustomVoice: (id) => request(`/api/voices/custom/${id}`, { method: 'DELETE' }),
  getStudio: () => request('/api/studio'),
  uploadSticker: (dataUrl) =>
    request('/api/studio/sticker', { method: 'POST', body: JSON.stringify({ data: dataUrl }) }),
  deleteSticker: () => request('/api/studio/sticker', { method: 'DELETE' }),
  uploadOutro: (dataUrl) =>
    request('/api/studio/outro', { method: 'POST', body: JSON.stringify({ data: dataUrl }) }),
  deleteOutro: () => request('/api/studio/outro', { method: 'DELETE' }),
  getJob: (id) => request(`/api/jobs/${id}`),
  lipsyncTest: () => request('/api/lipsync-test'),
  runLipsyncTest: (fresh) =>
    request('/api/lipsync-test', { method: 'POST', body: JSON.stringify({ fresh: Boolean(fresh) }) }),
};

// Suit un job jusqu'à la fin ; onTick reçoit l'état à chaque itération.
export async function followJob(jobId, onTick) {
  for (;;) {
    const job = await api.getJob(jobId);
    if (onTick) {
      onTick(job);
    }
    if (job.status === 'done') {
      return job;
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'Le traitement a échoué.');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
