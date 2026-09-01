// Ten endpoint działa WYŁĄCZNIE po stronie serwera (Next.js API route).
// Token PLVACC_API_TOKEN jest odczytywany ze zmiennej środowiskowej na serwerze
// i NIGDY nie jest wysyłany do przeglądarki użytkownika — front-end pyta tylko
// nasze własne /api/bookings, nie cv.plvacc.pl bezpośrednio.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.PLVACC_API_TOKEN;
  if (!token) {
    return res
      .status(500)
      .json({ error: 'Brak skonfigurowanego PLVACC_API_TOKEN na serwerze (patrz .env.local)' });
  }

  // Opcjonalny param "date" w formacie Y-m-d, np. /api/bookings?date=2026-08-26
  const { date } = req.query;
  const upstreamUrl = new URL(
    `https://cv.plvacc.pl/api/bookings${date ? '/' + encodeURIComponent(date) : ''}`
  );
  upstreamUrl.searchParams.set('token', token);

  try {
    const upstreamRes = await fetch(upstreamUrl.toString());
    const contentType = upstreamRes.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await upstreamRes.json()
      : await upstreamRes.text();

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: body });
    }

    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({ error: 'Nie udało się połączyć z PLVACC API' });
  }
}
