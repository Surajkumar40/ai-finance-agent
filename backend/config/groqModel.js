// Picks a Groq chat model that THIS api key can actually use.
// Override anytime with GROQ_MODEL=... in .env
const PREFERRED = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];
const NOT_CHAT = /whisper|tts|guard|embed|safeguard|orpheus|transcri/i;

let cached = null;
const bad = new Set();

async function pickModel(groq) {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  if (cached && !bad.has(cached)) return cached;
  const list = await groq.models.list();
  const ids = (list.data || []).map((m) => m.id).filter((id) => !bad.has(id));
  const chat = ids.filter((id) => !NOT_CHAT.test(id));
  cached = PREFERRED.find((id) => ids.includes(id)) || chat[0];
  if (!cached) throw new Error('No usable Groq chat model found for this API key');
  return cached;
}

// Chat completion that retries once with another model if the model is unavailable
async function groqComplete(groq, params) {
  let model = await pickModel(groq);
  try {
    return await groq.chat.completions.create({ ...params, model });
  } catch (e) {
    if (e.status === 404 && !process.env.GROQ_MODEL) {
      bad.add(model);
      model = await pickModel(groq);
      return await groq.chat.completions.create({ ...params, model });
    }
    throw e;
  }
}

module.exports = { groqComplete };
