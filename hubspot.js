export const maxDuration = 30; // Vercel Pro allows up to 60s; free tier allows up to 10s

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.HUBSPOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'HUBSPOT_TOKEN not set in environment variables' });

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  // Fetch with explicit 25s timeout
  const post = (url, body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    return fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
    }).then(r => { clearTimeout(timeout); return r.json(); })
      .catch(err => { clearTimeout(timeout); throw new Error('HubSpot request timed out or failed: ' + err.message); });
  };

  const { endpoint } = req.query;

  if (endpoint === 'deals') {
    try {
      const props = ['dealname','dealstage','amount','createdate','closedate',
        'close_lost_reason','closed_lost_details','competitors','lost_to',
        'hs_manual_forecast_category','num_contacted_notes','hs_next_step','closed_won_reason','implementation_amount','golive_date','soft_launch_date','next_step_date'];
      const body = {
        filterGroups: [{ filters: [{ propertyName: 'dealtype', operator: 'EQ', value: 'newbusiness' }] }],
        properties: props, limit: 200
      };
      const page1 = await post('https://api.hubapi.com/crm/v3/objects/deals/search', body);
      let results = page1.results || [];
      if (page1.paging?.next?.after) {
        const page2 = await post('https://api.hubapi.com/crm/v3/objects/deals/search',
          { ...body, after: page1.paging.next.after });
        results = results.concat(page2.results || []);
      }
      return res.status(200).json({ results, total: results.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Use ?endpoint=deals' });
}
