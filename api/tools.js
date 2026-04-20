const supabase = require('../lib/supabase');
const { callGemini } = require('../lib/gemini');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.url.split('?')[0].replace(/\/$/, '');
  const parts = url.split('/').filter(Boolean);
  // parts: ['api','tools'] or ['api','tools','execute',':name']

  const isExecute = parts[2] === 'execute' && parts[3];
  const toolName = isExecute ? parts[3] : null;

  // GET /tools - list all active tools
  if (!isExecute && req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('tools')
        .select('id, name, description, agent, trigger_hint, endpoint, created_by, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.status(200).json({ tools: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /tools - register new tool
  else if (!isExecute && req.method === 'POST') {
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
      res.status(500).json({ error: err.message });
    }
  }

  // POST /tools/execute/:name
  else if (isExecute && req.method === 'POST') {
    const { variables } = req.body;

    try {
      const { data: tool, error: toolError } = await supabase
        .from('tools')
        .select('*')
        .eq('name', toolName)
        .eq('active', true)
        .single();

      if (toolError && toolError.code === 'PGRST116') {
        return res.status(404).json({ error: `Tool "${toolName}" not found` });
      }
      if (toolError) throw toolError;

      let prompt = tool.prompt_template;
      if (variables && prompt) {
        Object.entries(variables).forEach(([key, value]) => {
          prompt = prompt.replaceAll(`{{${key}}}`, value);
        });
      }

      if (tool.agent !== 'flash_lite') {
        return res.status(400).json({ error: `Unsupported agent: ${tool.agent}` });
      }

      const raw = await callGemini(prompt);
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        result = { output: raw };
      }

      res.status(200).json({ success: true, tool: toolName, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
