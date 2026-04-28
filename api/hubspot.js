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

  if (req.query.endpoint !== 'deals' && req.query.endpoint !== 'emails') {
    return res.status(400).json({ error: 'Use ?endpoint=deals or ?endpoint=emails' });
  }

  // ── EMAILS ENDPOINT — recent opened emails (last 7 days, top 10) ─────
  if (req.query.endpoint === 'emails') {
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const body = {
        filterGroups: [{
          filters: [
            { propertyName: 'hs_email_open_count', operator: 'GT', value: '0' },
            { propertyName: 'hs_email_direction',  operator: 'EQ', value: 'EMAIL' },
            { propertyName: 'hs_timestamp',        operator: 'GT', value: String(sevenDaysAgo) }
          ]
        }],
        sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
        properties: ['hs_email_subject', 'hs_timestamp', 'hs_email_open_count'],
        limit: 10
      };
      const resp = await post('https://api.hubapi.com/crm/v3/objects/emails/search', body);
      // Surface HubSpot errors clearly instead of returning empty
      if (resp.status === 'error' || resp.message) {
        return res.status(500).json({ error: resp.message || 'HubSpot search failed', detail: resp });
      }
      return res.status(200).json({ results: resp.results || [], total: resp.total || 0 });
    } catch (err) {
      return res.status(500).json({ error: 'Email fetch failed: ' + err.message });
    }
  }

  try {
    // Fetch ALL deal types: newbusiness, existingbusiness (Expansion), Renewal
    // Uses 3 separate filterGroups joined with OR at the API level
    const filter = {
      filterGroups: [
        { filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] },
        { filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'existingbusiness' }] },
        { filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'Renewal' }] }
      ],
      limit: 200
    };

    const props1 = [
      'dealname', 'dealstage', 'amount', 'createdate', 'closedate',
      'close_lost_reason', 'closed_lost_details', 'competitors', 'lost_to',
      'hs_manual_forecast_category', 'num_contacted_notes',
      'hs_next_step', 'closed_won_reason', 'hubspot_owner_id', 'dealtype'
    ];
    const props2 = [
      'implementation_amount', 'golive_date', 'soft_launch_date', 'next_step_date'
    ];

    // Page through all results (HubSpot returns max 200 per page)
    let results = [];
    let after = null;
    for (let page = 0; page < 5; page++) {
      const body = { ...filter, properties: props1 };
      if (after) body.after = after;
      const resp = await post('https://api.hubapi.com/crm/v3/objects/deals/search', body);
      results = results.concat(resp.results || []);
      if (!resp.paging?.next?.after) break;
      after = resp.paging.next.after;
    }

    // Batch-fetch extra props
    const ids = results.map(d => ({ id: String(d.id) }));
    let extraProps = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const batch = await post('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
        inputs: chunk,
        properties: props2
      });
      if (batch.results) extraProps = extraProps.concat(batch.results);
    }

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
