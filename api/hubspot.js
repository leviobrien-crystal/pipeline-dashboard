export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.HUBSPOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'HUBSPOT_TOKEN not set' });

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  const post = (url, body) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal })
      .then(r => { clearTimeout(t); return r.json(); })
      .catch(err => { clearTimeout(t); throw new Error('HubSpot request failed: ' + err.message); });
  };

  if (req.query.endpoint !== 'deals') {
    return res.status(400).json({ error: 'Use ?endpoint=deals' });
  }

  try {
    const filter = {
      filterGroups: [{ filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] }],
      limit: 200
    };

    // Split properties into two batches to avoid HubSpot search API limits
    const props1 = [
      'dealname', 'dealstage', 'amount', 'createdate', 'closedate',
      'close_lost_reason', 'closed_lost_details', 'competitors', 'lost_to',
      'hs_manual_forecast_category', 'num_contacted_notes',
      'hs_next_step', 'closed_won_reason'
    ];
    const props2 = [
      'implementation_amount', 'golive_date', 'soft_launch_date', 'next_step_date'
    ];

    // Fetch page 1 with core props
    const page1 = await post('https://api.hubapi.com/crm/v3/objects/deals/search', { ...filter, properties: props1 });
    let results = page1.results || [];

    if (page1.paging?.next?.after) {
      const page2 = await post('https://api.hubapi.com/crm/v3/objects/deals/search', { ...filter, properties: props1, after: page1.paging.next.after });
      results = results.concat(page2.results || []);
    }

    // Now batch-fetch the date/impl fields separately using the batch read API
    // which has no property count limits
    const ids = results.map(d => ({ id: String(d.id) }));

    // Process in chunks of 100 (HubSpot batch limit)
    let extraProps = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const batch = await post('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
        inputs: chunk,
        properties: props2
      });
      if (batch.results) extraProps = extraProps.concat(batch.results);
    }

    // Merge extra props into main results
    const extraMap = {};
    extraProps.forEach(d => { extraMap[d.id] = d.properties; });

    results = results.map(d => ({
      ...d,
      properties: {
        ...d.properties,
        ...(extraMap[d.id] || {})
      }
    }));

    return res.status(200).json({ results, total: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
