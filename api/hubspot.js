export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.HUBSPOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'HUBSPOT_TOKEN not set in environment variables' });

  const hs = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());

  const { endpoint, dealIds } = req.query;

  // --- DEALS ---
  if (endpoint === 'deals') {
    try {
      // HubSpot max 200 per page — fetch up to 400 (two pages) to be safe
      const page1 = await hs('https://api.hubapi.com/crm/v3/objects/deals/search', {
        filterGroups: [{ filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] }],
        properties: ['dealname','dealstage','amount','createdate','closedate',
          'close_lost_reason','closed_lost_details','competitors','lost_to',
          'hs_manual_forecast_category','num_contacted_notes'],
        limit: 200,
        after: 0
      });

      let results = page1.results || [];

      if (page1.paging?.next?.after) {
        const page2 = await hs('https://api.hubapi.com/crm/v3/objects/deals/search', {
          filterGroups: [{ filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] }],
          properties: ['dealname','dealstage','amount','createdate','closedate',
            'close_lost_reason','closed_lost_details','competitors','lost_to',
            'hs_manual_forecast_category','num_contacted_notes'],
          limit: 200,
          after: page1.paging.next.after
        });
        results = results.concat(page2.results || []);
      }

      return res.status(200).json({ results, total: results.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- COMPANIES (associated with deal IDs) ---
  if (endpoint === 'companies') {
    if (!dealIds) return res.status(400).json({ error: 'dealIds param required' });
    const ids = dealIds.split(',').map(Number).filter(Boolean);
    const BATCH = 50;
    let allCompanies = [];
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const data = await hs('https://api.hubapi.com/crm/v3/objects/companies/search', {
          filterGroups: [{
            associatedWith: [{ objectType: 'deals', operator: 'IN', objectIdValues: batch }]
          }],
          properties: ['name', 'size', 'segmentation', 'current_pos'],
          limit: 100
        });
        if (data.results) allCompanies = allCompanies.concat(data.results);
      }
      return res.status(200).json({ results: allCompanies });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Use ?endpoint=deals or ?endpoint=companies&dealIds=1,2,3' });
}
