const supabase = require('../../../lib/supabase');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('conversation_checkpoints')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      // No checkpoints yet — not an error, just empty
      return res.status(200).json({ checkpoint: null });
    }

    if (error) throw error;

    res.status(200).json({ checkpoint: data });
  } catch (err) {
    console.error('Error fetching checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
};