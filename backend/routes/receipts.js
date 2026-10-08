const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const MODEL = 'claude-sonnet-5-5';
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const today = () => new Date().toLocaleDateString('en-CA');

function extractJson(text) {
  const clean = String(text).replace(/```json|```/g, '');
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('The AI did not return readable data');
  return JSON.parse(clean.slice(a, b + 1));
}

// POST /api/receipts/scan  { image: "data:image/jpeg;base64,...." }
router.post('/scan', auth, async (req, res) => {
  try {
    if (!anthropic) return res.status(503).json({ message: 'Receipt scanning needs ANTHROPIC_API_KEY in backend/.env' });

    let { image, mediaType } = req.body;
    if (!image) return res.status(400).json({ message: 'No image received' });
    const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/i.exec(image);
    if (m) { mediaType = m[1].toLowerCase(); image = m[2]; }
    if (!TYPES.includes(mediaType)) return res.status(400).json({ message: 'Please upload a JPG, PNG, WEBP or GIF image' });
    if (image.length > 8 * 1024 * 1024) return res.status(413).json({ message: 'Image is too large (max about 6 MB)' });

    const [cats] = await db.query(
      'SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = ?', [req.user.id]);
    const names = cats.map((c) => c.name);

    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        'You read photos of receipts and bills. Reply with ONLY one JSON object, no other text: ' +
        '{"title": string (shop or short description), "amount": number (final total paid, no currency symbol), ' +
        '"date": "YYYY-MM-DD" or null, "type": "expense" or "income", ' +
        '"category": one of [' + names.join(', ') + '] or null}. ' +
        'If the image is not a receipt or the total is unreadable, use {"error": "short reason"}.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `Today is ${today()}. Extract the receipt details.` },
        ],
      }],
    });

    const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const data = extractJson(text);
    if (data.error) return res.status(422).json({ message: 'Could not read this receipt: ' + data.error });

    const amount = Number(String(data.amount).replace(/[^0-9.]/g, ''));
    if (!(amount > 0)) return res.status(422).json({ message: 'Could not find a total amount on this receipt' });

    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') && !isNaN(new Date(data.date)) ? data.date : today();
    const cat = cats.find((c) => c.name.toLowerCase() === String(data.category || '').toLowerCase());

    res.json({
      title: String(data.title || 'Receipt').trim().slice(0, 150),
      amount,
      date,
      type: data.type === 'income' ? 'income' : 'expense',
      category: cat?.name || null,
      category_id: cat?.id || null,
    });
  } catch (err) {
    console.error('RECEIPT SCAN ERROR:', err.message);
    const status = err.status === 401 ? 502 : 500;
    res.status(status).json({ message: err.status === 401 ? 'Anthropic API key is invalid' : err.message });
  }
});

module.exports = router;
