const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET /projects - list all projects
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, tech_stack, status, created_at, last_modified')
        .order('last_modified', { ascending: false });

      if (error) throw error;

      res.status(200).json({ projects: data });
    } catch (err) {
      console.error('Error fetching projects:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /projects - create new project
  else if (req.method === 'POST') {
    const { name, description, tech_stack } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

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
      console.error('Error creating project:', err);
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};