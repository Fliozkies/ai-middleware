const keys = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
  process.env.GEMINI_KEY_4,
  process.env.GEMINI_KEY_5,
  process.env.GEMINI_KEY_6,
  process.env.GEMINI_KEY_7,
  process.env.GEMINI_KEY_8,
].filter(Boolean);

let currentKeyIndex = 0;

function getNextKey() {
  const key = keys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
}

async function callGemini(prompt) {
  const key = getNextKey();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Gemini error: ${JSON.stringify(data)}`);
  }

  return data.candidates[0].content.parts[0].text.trim();
}

async function classifyFact(content) {
  const prompt = `You are a classification agent.
Input fact: "${content}"
Respond ONLY with valid JSON. No preamble. No explanation. No markdown.
{
  "category": "preference|goal|decision|context|relationship|pattern",
  "importance": 1|2|3,
  "tags": ["tag1", "tag2"]
}`;

  const result = await callGemini(prompt);
  return JSON.parse(result);
}

async function summarizeCheckpoint(conversation) {
  const prompt = `You are a summarization agent.
Summarize this conversation into a checkpoint.
Conversation: "${conversation}"
Respond ONLY with valid JSON. No preamble. No explanation. No markdown.
{
  "summary": "2-3 sentences max",
  "active_topics": ["topic1", "topic2"],
  "decisions_made": ["decision1"],
  "open_threads": ["thread1"],
  "next_logical_step": "one sentence"
}`;

  const result = await callGemini(prompt);
  return JSON.parse(result);
}

async function generateEmbedding(text) {
  const key = getNextKey();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2-preview',
        content: { parts: [{ text }] },
        outputDimensionality: 1536
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Embedding error: ${JSON.stringify(data)}`);
  }

  return data.embedding.values;
}

module.exports = { callGemini, classifyFact, summarizeCheckpoint, generateEmbedding };
