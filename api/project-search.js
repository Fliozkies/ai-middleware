const supabase = require('../lib/supabase');
const { generateEmbedding } = require('../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const embedding = await generateEmbedding(q);

    const { data, error } = await supabase.rpc('search_project_files', {
      query_embedding: embedding,
      project_id_input: id,
      match_count: 5
    });

    if (error) throw error;
    res.status(200).json({ results: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
