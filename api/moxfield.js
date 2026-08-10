// Proxy za Moxfield: api2.moxfield.com ne šalje CORS zaglavlja, pa poziv
// direktno iz browsera pada. Ovdje ga radimo server-side i vraćamo JSON
// sa dozvolom za našu stranicu.
export default async function handler(req, res) {
  const id = String(req.query.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    res.status(400).json({ error: 'Neispravan deck id.' });
    return;
  }
  try {
    const r = await fetch(`https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'mtg-commander-simulator' },
    });
    const body = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // kratki keš: iste liste se često učitavaju uzastopno
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'Moxfield nedostupan: ' + e.message });
  }
}
