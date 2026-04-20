const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET /tools - list all active tools
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('tools')
        .select('id, name, description, agent, trigger_hint, endpoint, created_by, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({ tools: data });
    } catch (err) {
      console.error('Error fetching tools:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /tools - register a new tool
  else if (req.method === 'POST') {
    const { name, description, agent, trigger_hint, prompt_template, endpoint, created_by } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'name and description are required' });
    }

    try {
      const { data, error } = await supabase
        .from('tools')
        .insert({
          name,
          description,
          agent: agent ?? 'flash_lite',
          trigger_hint: trigger_hint ?? null,
          prompt_template: prompt_template ?? null,
          endpoint: endpoint ?? null,
          created_by: created_by ?? 'claude',
          active: true
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, tool: data });
    } catch (err) {
      console.error('Error creating tool:', err);
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};