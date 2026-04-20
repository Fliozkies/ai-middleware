const supabase = require('../../lib/supabase');
const { generateEmbedding } = require('../../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }

  try {
    // Generate embedding for the search query
    const embedding = await generateEmbedding(q);

    // Vector similarity search using pgvector
    const { data, error } = await supabase.rpc('search_facts', {
      query_embedding: embedding,
      match_count: 5
    });

    if (error) throw error;

    res.status(200).json({ facts: data });
  } catch (err) {
    console.error('Error searching facts:', err);
    res.status(500).json({ error: err.message });
  }
};