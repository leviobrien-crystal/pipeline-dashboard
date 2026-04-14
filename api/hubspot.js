export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.HUBSPOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'HUBSPOT_TOKEN not set in environment variables' });

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
  const post = (url, body) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json());
  const get  = (url)       => fetch(url, { method: 'GET',  headers }).then(r => r.json());

  const { endpoint, dealIds, companyIds } = req.query;

  // --- DEALS ---
  if (endpoint === 'deals') {
    try {
      const props = ['dealname','dealstage','amount','createdate','closedate',
        'close_lost_reason','closed_lost_details','competitors','lost_to',
        'hs_manual_forecast_category','num_contacted_notes'];
      const body = {
        filterGroups: [{ filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] }],
        properties: props, limit: 200, after: 0
      };
      const page1 = await post('https://api.hubapi.com/crm/v3/objects/deals/search', body);
      let results = page1.results || [];
      if (page1.paging?.next?.after) {
        const page2 = await post('https://api.hubapi.com/crm/v3/objects/deals/search', { ...body, after: page1.paging.next.after });
        results = results.concat(page2.results || []);
      }
      return res.status(200).json({ results, total: results.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- DEAL→COMPANY ASSOCIATIONS (batch v4 API) ---
  if (endpoint === 'associations') {
    if (!dealIds) return res.status(400).json({ error: 'dealIds param required' });
    const ids = dealIds.split(',').filter(Boolean);
    try {
      // HubSpot batch associations API — returns which company is linked to each deal
      const data = await post('https://api.hubapi.com/crm/v4/associations/deals/companies/batch/read', {
        inputs: ids.map(id => ({ id }))
      });
      // Returns: { results: [{ from: { id }, to: [{ toObjectId }] }] }
      const map = {};
      (data.results || []).forEach(r => {
        if (r.to && r.to.length > 0) {
          map[r.from.id] = r.to[0].toObjectId;
        }
      });
      return res.status(200).json({ map });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- COMPANIES by IDs ---
  if (endpoint === 'companies') {
    if (!companyIds) return res.status(400).json({ error: 'companyIds param required' });
    const ids = companyIds.split(',').map(Number).filter(Boolean);
    const BATCH = 100;
    let allCompanies = [];
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const data = await post('https://api.hubapi.com/crm/v3/objects/companies/batch/read', {
          inputs: batch.map(id => ({ id: String(id) })),
          properties: ['name', 'size', 'segmentation', 'current_pos']
        });
        if (data.results) allCompanies = allCompanies.concat(data.results);
      }
      return res.status(200).json({ results: allCompanies });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Use ?endpoint=deals, ?endpoint=associations&dealIds=1,2, or ?endpoint=companies&companyIds=1,2' });
}
