const supabase = require('../../lib/supabase');
const { summarizeCheckpoint } = require('../../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { conversation, summary, active_topics, decisions_made, open_threads, next_logical_step } = req.body;

  try {
    let checkpoint;

    // If raw conversation is passed, let Flash Lite summarize it
    if (conversation) {
      checkpoint = await summarizeCheckpoint(conversation);
    } else {
      // Otherwise use the provided structured data directly
      checkpoint = { summary, active_topics, decisions_made, open_threads, next_logical_step };
    }

    const { data, error } = await supabase
      .from('conversation_checkpoints')
      .insert({
        summary: checkpoint.summary,
        active_topics: checkpoint.active_topics,
        decisions_made: checkpoint.decisions_made,
        open_threads: checkpoint.open_threads,
        next_logical_step: checkpoint.next_logical_step
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, checkpoint: data });
  } catch (err) {
    console.error('Error saving checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
};