const supabase = require('../lib/supabase');
const { classifyFact, generateEmbedding, summarizeCheckpoint } = require('../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.url.split('?')[0].replace(/\/$/, '');

  // POST /memory/fact
  if (url === '/api/memory/fact' && req.method === 'POST') {
    const { content, importance, source } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    try {
      const classification = await classifyFact(content);
      const embedding = await generateEmbedding(content);

      const { data, error } = await supabase
        .from('facts')
        .insert({
          content,
          category: classification.category,
          importance: importance ?? classification.importance,
          source: source ?? 'conversation',
          embedding,
          last_updated: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, fact: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /memory/core
  else if (url === '/api/memory/core' && req.method === 'GET') {
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
      res.status(500).json({ error: err.message });
    }
  }

  // GET /memory/search?q=
  else if (url === '/api/memory/search' && req.method === 'GET') {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });

    try {
      const embedding = await generateEmbedding(q);
      const { data, error } = await supabase.rpc('search_facts', {
        query_embedding: embedding,
        match_count: 5
      });

      if (error) throw error;
      res.status(200).json({ facts: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /memory/checkpoint
  else if (url === '/api/memory/checkpoint' && req.method === 'POST') {
    const { conversation, summary, active_topics, decisions_made, open_threads, next_logical_step } = req.body;

    try {
      let checkpoint;
      if (conversation) {
        checkpoint = await summarizeCheckpoint(conversation);
      } else {
        checkpoint = { summary, active_topics, decisions_made, open_threads, next_logical_step };
      }

      const { data, error } = await supabase
        .from('conversation_checkpoints')
        .insert(checkpoint)
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, checkpoint: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /memory/checkpoint/latest
  else if (url === '/api/memory/checkpoint/latest' && req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('conversation_checkpoints')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code === 'PGRST116') {
        return res.status(200).json({ checkpoint: null });
      }

      if (error) throw error;
      res.status(200).json({ checkpoint: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(404).json({ error: 'Route not found' });
  }
};
