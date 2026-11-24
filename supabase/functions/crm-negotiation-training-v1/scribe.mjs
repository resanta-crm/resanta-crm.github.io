const root = 'https://trans.hd-resanta.ru/api/v1';
export const fileLimit = 160 * 1024 * 1024;
export const audioTypes = new Map([
  ['audio/mpeg', 'mp3'], ['audio/mp4', 'm4a'], ['audio/x-m4a', 'm4a'],
  ['video/mp4', 'mp4'], ['audio/aac', 'aac'], ['audio/ogg', 'ogg'],
  ['audio/webm', 'webm'], ['video/webm', 'webm'], ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'], ['audio/flac', 'flac'],
]);

export function createScribe(key, request = fetch) {
  async function call(method, path, options = {}) {
    if (!key) throw Object.assign(Error('scribe_not_configured'), {status: 503});
    const response = await request(root + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(24_000),
      headers: {Authorization: 'Bearer ' + key, Accept: 'application/json', ...options.headers},
      body: options.body,
    }).catch(() => { throw Object.assign(Error('scribe_unavailable'), {status: 503}); });
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? 'scribe_queue_full' : status === 409 ? 'scribe_busy' : 'scribe_unavailable';
      throw Object.assign(Error(code), {status: status === 429 ? 429 : status === 409 ? 409 : 503, upstream: status});
    }
    return response.json();
  }

  const pathFor = (base, id) => base + '/' + encodeURIComponent(id);
  const form = (name, field, filename) => {
    const body = new FormData();
    if (filename) body.set(name, field, filename);
    else body.set(name, field);
    return {body};
  };
  return {
    start: (name, size, type) => call('POST', '/uploads', {
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, size_bytes: size, content_type: type, language: 'ru', diarize: true}),
    }),
    part: (id, index, blob) => call('POST', pathFor('/uploads', id) + '/parts/' + index, form('chunk', blob, 'part')),
    complete: id => call('POST', pathFor('/uploads', id) + '/complete', form('done', '1')),
    jobs: () => call('GET', '/jobs'),
    status: id => call('GET', pathFor('/jobs', id)),
    result: id => call('GET', pathFor('/jobs', id) + '/result?format=json'),
    remove: id => call('DELETE', pathFor('/jobs', id)),
  };
}

export function normalizeTranscript(value) {
  const segments = (Array.isArray(value?.segments) ? value.segments : []).flatMap(segment => {
    const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
    if (!text || !Number.isFinite(segment.start) || segment.start < 0) return [];
    return [{time: segment.start, speaker: typeof segment.speaker === 'string' ? segment.speaker.slice(0, 50) : null, text}];
  });
  return segments;
}
