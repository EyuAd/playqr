const PLAY_ORIGIN = 'https://play.google.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': 'https://eyuad.github.io',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=300'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname !== '/search') return Response.json({ error: 'Not found' }, { status: 404, headers });
    const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
    if (!query) return Response.json({ apps: [] }, { headers });

    const playUrl = `${PLAY_ORIGIN}/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en&gl=US`;
    const upstream = await fetch(playUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PlayQR/1.0)' } });
    if (!upstream.ok) return Response.json({ error: 'Google Play search failed' }, { status: 502, headers });

    const found = new Map();
    let current = null;
    const rewriter = new HTMLRewriter()
      .on('a[href*="/store/apps/details?id="]', {
        element(element) {
          const href = element.getAttribute('href');
          if (!href) return;
          const appUrl = new URL(href, PLAY_ORIGIN);
          const id = appUrl.searchParams.get('id');
          if (!id || found.has(id)) { current = null; return; }
          current = { id, title: element.getAttribute('aria-label') || '', developer: '', icon: '', iconScore: -100, text: '', url: `${PLAY_ORIGIN}/store/apps/details?id=${encodeURIComponent(id)}` };
          found.set(id, current);
          element.onEndTag(() => { current = null; });
        },
        text(text) { if (current) current.text += ` ${text.text}`; }
      })
      .on('a[href*="/store/apps/details?id="] img', {
        element(element) {
          if (!current) return;
          const src = element.getAttribute('src') || element.getAttribute('data-src') || '';
          if (!src) return;
          let score = 0;
          if (/play-lh\.googleusercontent\.com/i.test(src)) score += 4;
          if (/i\.ytimg\.com|youtube\.com/i.test(src)) score -= 20;
          if (/=s\d+/i.test(src)) score += 7;
          const dimensions = src.match(/=w(\d+)-h(\d+)/i);
          if (dimensions) {
            const ratio = Number(dimensions[1]) / Number(dimensions[2]);
            score += Math.abs(ratio - 1) < 0.18 ? 8 : -8;
          }
          if (score > current.iconScore) { current.icon = src; current.iconScore = score; }
        }
      });
    await rewriter.transform(upstream).arrayBuffer();

    const apps = [...found.values()].slice(0, 8).map(app => {
      const parts = app.text.replace(/\s+/g, ' ').trim().split(/\s{2,}| · /).filter(Boolean);
      const cleanedTitle = (app.title || parts[0] || app.id).replace(/^Install\s+/i, '').trim();
      return { id: app.id, title: cleanedTitle, developer: parts[1] || '', icon: app.iconScore >= 5 ? app.icon : '', url: app.url };
    });
    return Response.json({ apps }, { headers });
  }
};

