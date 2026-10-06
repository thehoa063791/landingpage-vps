// Run in the shared Vimeo review folder with agent-browser eval --stdin.
// Extracts lesson metadata only; temporary review signatures are not stored.
(async () => {
  const cards = Array.from(document.querySelectorAll('[role="group"]'))
    .map(card => ({ url: card.querySelector('a')?.href, lines: card.innerText.split('\n').filter(Boolean) }))
    .filter(card => /\/reviews\/[^/]+\/videos\/\d+$/.test(card.url || ''));
  const lessons = [];
  for (let start = 0; start < cards.length; start += 4) {
    lessons.push(...await Promise.all(cards.slice(start, start + 4).map(async card => {
      const response = await fetch(card.url);
      if (!response.ok) throw new Error(`Review metadata returned ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const props = JSON.parse(doc.getElementById('__NEXT_DATA__').textContent).props.pageProps;
      const config = new URL(props.embedPlayerConfigUrl);
      const videoId = String(props.videoId);
      const hash = config.searchParams.get('h');
      const duration = card.lines[0].split(':').reduce((total, part) => total * 60 + Number(part), 0);
      return { id: Number(videoId), title: props.ogTitle || card.lines[1], vimeo_video_id: hash ? `${videoId}/${hash}` : videoId, duration };
    })));
  }
  return JSON.stringify(lessons);
})();
