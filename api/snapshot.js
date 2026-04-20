const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch core memory, latest checkpoint, and tools in parallel
    const [factsResult, checkpointResult, toolsResult] = await Promise.all([
      supabase
        .from('facts')
        .select('id, category, content, importance, created_at')
        .eq('importance', 3)
        .order('last_updated', { ascending: false })
        .limit(20),
      supabase
        .from('conversation_checkpoints')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('tools')
        .select('id, name, description, trigger_hint')
        .eq('active', true)
        .order('created_at', { ascending: false }),
    ]);

    const snapshot = {
      generated_at: new Date().toISOString(),
      facts: factsResult.data || [],
      checkpoint: checkpointResult.error?.code === 'PGRST116'
        ? null
        : (checkpointResult.data || null),
      tools: toolsResult.data || [],
    };

    // Write snapshot.json to GitHub repo via API
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO = 'Fliozkies/ai-middleware';
    const FILE_PATH = 'snapshot.json';
    const BRANCH = 'main';

    // Get current file SHA (needed for updates)
    const getRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    let sha;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    // Write the file
    const content = Buffer.from(JSON.stringify(snapshot, null, 2)).toString('base64');
    const putBody = {
      message: `snapshot ${snapshot.generated_at}`,
      content,
      branch: BRANCH,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(putBody),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(`GitHub write failed: ${JSON.stringify(err)}`);
    }

    res.status(200).json({ success: true, generated_at: snapshot.generated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
