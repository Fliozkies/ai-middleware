const supabase = require('../../lib/supabase');
const { classifyFact } = require('../../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content, importance, source } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    // Flash Lite classifies and tags the fact
    const classification = await classifyFact(content);

    const { data, error } = await supabase
      .from('facts')
      .insert({
        content,
        category: classification.category,
        importance: importance ?? classification.importance,
        source: source ?? 'conversation',
        last_updated: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, fact: data });
  } catch (err) {
    console.error('Error storing fact:', err);
    res.status(500).json({ error: err.message });
  }
};