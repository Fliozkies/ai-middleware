const supabase = require('../../../lib/supabase');
const { callGemini } = require('../../../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.query;
  const { variables } = req.body;

  try {
    // Fetch the tool definition
    const { data: tool, error: toolError } = await supabase
      .from('tools')
      .select('*')
      .eq('name', name)
      .eq('active', true)
      .single();

    if (toolError && toolError.code === 'PGRST116') {
      return res.status(404).json({ error: `Tool "${name}" not found` });
    }

    if (toolError) throw toolError;

    // Substitute variables into prompt template
    let prompt = tool.prompt_template;
    if (variables && prompt) {
      Object.entries(variables).forEach(([key, value]) => {
        prompt = prompt.replaceAll(`{{${key}}}`, value);
      });
    }

    let result;

    if (tool.agent === 'flash_lite') {
      // Execute via Flash Lite
      const raw = await callGemini(prompt);

      // Attempt JSON parse, fall back to raw text
      try {
        result = JSON.parse(raw);
      } catch {
        result = { output: raw };
      }
    } else {
      return res.status(400).json({ error: `Unsupported agent type: ${tool.agent}` });
    }

    res.status(200).json({ success: true, tool: name, result });
  } catch (err) {
    console.error('Error executing tool:', err);
    res.status(500).json({ error: err.message });
  }
};