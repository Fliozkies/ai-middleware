const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.url.split('?')[0].replace(/\/$/, '');
  const parts = url.split('/').filter(Boolean);
  // parts: ['api', 'projects'] or ['api', 'projects', ':id']
  const projectId = parts.length === 3 ? parts[2] : null;

  // GET /projects - list all
  if (!projectId && req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, tech_stack, status, created_at, last_modified')
        .order('last_modified', { ascending: false });

      if (error) throw error;
      res.status(200).json({ projects: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /projects - create new
  else if (!projectId && req.method === 'POST') {
    const { name, description, tech_stack } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name,
          description: description ?? null,
          tech_stack: tech_stack ?? null,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, project: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /projects/:id - single project
  else if (projectId && req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error && error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (error) throw error;
      res.status(200).json({ project: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
