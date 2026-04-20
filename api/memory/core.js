const supabase = require('../../lib/supabase');

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
      .from('facts')
      .select('id, category, content, importance, created_at')
      .eq('importance', 3)
      .order('last_updated', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.status(200).json({ facts: data });
  } catch (err) {
    console.error('Error fetching core facts:', err);
    res.status(500).json({ error: err.message });
  }
};