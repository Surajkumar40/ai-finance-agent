// Turns a spoken (or typed) sentence into transactions.
//   "spent 250 on lunch yesterday and 40 on tea"  ->  two expenses, dated yesterday
//   "received salary 45k on 1st october"          ->  one income
// Works fully in the browser, no server and no AI needed. All dates are plain YYYY-MM-DD strings.

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const MULT = { thousand: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lakhs_: 1e5, crore: 1e7, crores: 1e7 };
const CURRENCY = new Set(['rs', 'inr', 'rupee', 'rupees', 'rupaye', 'rupay', '₹', 'bucks']);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const validDay = (y, m, d) => { const x = new Date(Date.UTC(y, m, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m && x.getUTCDate() === d; };

// Finds a date phrase. Returns { date, text } where text is the sentence with that phrase removed, or null.
function takeDate(text, today) {
  let m;
  const cut = (re, date) => ({ date, text: text.replace(re, ' ') });
  if (/\bday before yesterday\b/.test(text)) return cut(/\bday before yesterday\b/, addDays(today, -2));
  if (/\byesterday\b/.test(text)) return cut(/\byesterday\b/, addDays(today, -1));
  if (/\blast night\b/.test(text)) return cut(/\blast night\b/, addDays(today, -1));
  if ((m = /\b(\d{1,3}|a|one|two|three|four|five|six|seven|eight|nine|ten) days? ago\b/.exec(text))) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : (m[1] === 'a' ? 1 : UNITS[m[1]]);
    return cut(/\b(\d{1,3}|a|one|two|three|four|five|six|seven|eight|nine|ten) days? ago\b/, addDays(today, -n));
  }
  if (/\blast week\b/.test(text)) return cut(/\blast week\b/, addDays(today, -7));
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(text)) return cut(/\b(today|tonight|this (morning|afternoon|evening))\b/, today);

  const y = Number(today.slice(0, 4));
  const monthRe = MONTHS.map((x) => x.slice(0, 3) + '[a-z]*').join('|');
  const build = (day, mon) => {
    const mi = MONTHS.findIndex((x) => x.startsWith(mon.slice(0, 3)));
    if (mi < 0 || !validDay(y, mi, day)) return null;
    let date = `${y}-${pad(mi + 1)}-${pad(day)}`;
    if (date > today) date = `${y - 1}-${pad(mi + 1)}-${pad(day)}`; // a day later than today must mean last year
    return date;
  };
  const a = new RegExp(`\\b(?:on |the )?(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${monthRe})\\b`).exec(text);
  if (a) { const d = build(Number(a[1]), a[2]); if (d) return cut(new RegExp(a[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), d); }
  const b = new RegExp(`\\b(?:on )?(${monthRe}) (\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(text);
  if (b) { const d = build(Number(b[2]), b[1]); if (d) return cut(new RegExp(b[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), d); }
  const c = /\bon (?:the )?(\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  if (c) {
    const day = Number(c[1]); const [yy, mm] = today.split('-').map(Number);
    let date = validDay(yy, mm - 1, day) ? `${yy}-${pad(mm)}-${pad(day)}` : null;
    if (date && date > today) { const pm = mm === 1 ? 12 : mm - 1; const py = mm === 1 ? yy - 1 : yy; date = validDay(py, pm - 1, day) ? `${py}-${pad(pm)}-${pad(day)}` : null; }
    if (date) return cut(/\bon (?:the )?\d{1,2}(?:st|nd|rd|th)\b/, date);
  }
  const w = new RegExp(`\\b(?:(last|on|this) )?(${WEEKDAYS.join('|')})\\b`).exec(text);
  if (w) {
    const idx = WEEKDAYS.indexOf(w[2]);
    const todayIdx = toDate(today).getUTCDay();
    let back = (todayIdx - idx + 7) % 7;
    if (back === 0 && w[1] === 'last') back = 7;
    return cut(new RegExp(w[0]), addDays(today, -back));
  }
  return null;
}

// ---------- numbers ----------
// Splits text into pieces: { t: 'num', value, text } or { t: 'word', text }
function tokenize(text) {
  const raw = text.match(/\d[\d,]*(?:\.\d+)?|[a-z]+|₹|[^\sa-z\d]/g) || [];
  return raw;
}
const isDigit = (x) => /^\d/.test(x);
const isNumWord = (x) => x in UNITS || x in TENS;

function readNumbers(tokens) {
  const out = []; // pieces
  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    const startsNumber = isDigit(tk) || isNumWord(tk) || ((tk === 'a' || tk === 'an') && (tokens[i + 1] === 'hundred' || tokens[i + 1] in MULT));
    if (!startsNumber) { out.push({ t: 'word', text: tk }); i++; continue; }
    let total = 0, cur = 0, j = i, last = null; const start = i;
    for (; j < tokens.length; j++) {
      const x = tokens[j];
      if (isDigit(x)) { if (last === 'digit' || last === 'unit') break; cur += Number(x.replace(/,/g, '')); last = 'digit'; }
      else if ((x === 'a' || x === 'an') && j === i) { cur += 1; last = 'unit'; }
      else if (x in UNITS) { if (last === 'unit' || last === 'digit') break; cur += UNITS[x]; last = 'unit'; }
      else if (x in TENS) { if (last === 'unit' || last === 'digit' || last === 'tens') break; cur += TENS[x]; last = 'tens'; }
      else if (x === 'hundred') { if (last === null || last === 'mult') break; cur = (cur || 1) * 100; last = 'hundred'; }
      else if (x in MULT) { if (last === null || last === 'mult') break; total += (cur || 1) * MULT[x]; cur = 0; last = 'mult'; }
      else if (x === 'and' && last && last !== 'digit' && (isNumWord(tokens[j + 1] || '') )) { /* "two hundred and fifty" */ }
      else break;
    }
    // a bare word number like "one" or "a" only counts when it stands on its own as a small count; it is kept as a number piece
    out.push({ t: 'num', value: total + cur, text: tokens.slice(start, j).join(' '), digits: isDigit(tk) });
    i = j > start ? j : i + 1;
  }
  return out;
}

// ---------- type / category ----------
const EXPENSE_WORDS = /\b(spent|spend|paid|pay|bought|buy|purchased|ordered|gave|give|sent|lost|bill|charged|cost|costs|booked|recharged|recharge|donated|withdrew)\b/;
const INCOME_STRONG = /\b(received|earned|earn|credited|deposited|salary|bonus|refund|refunded|cashback|stipend|dividend|interest|income|sold|won|reimbursed|reimbursement|freelance|freelancing|invoice|payout)\b/;
const INCOME_GOT = /\bgot\b(?: \w+){0,3}? (?:salary|bonus|refund|cashback|stipend|payment|paid|interest|dividend|rent)\b|\bgot (?:rs )?\d/;

const KEYWORDS = [
  [/\b(lunch|dinner|breakfast|brunch|snack|snacks|coffee|tea|chai|pizza|burger|biryani|restaurant|cafe|food|meal|swiggy|zomato|dominos|mcdonalds|kfc|starbucks|juice|ice cream|dessert|momos|sandwich|eating|dining|groceries|grocery|vegetables|fruits|milk|bakery)\b/, /food|dining|grocer/i],
  [/\b(uber|ola|rapido|auto|cab|taxi|bus|metro|train|petrol|diesel|fuel|parking|toll|flight|fastag|rickshaw|commute)\b/, /transport|travel|fuel/i],
  [/\b(amazon|flipkart|myntra|clothes|shirt|shoes|dress|jeans|shopping|mall|gadget|phone|laptop|watch|bag)\b/, /shop/i],
  [/\b(electricity|water|wifi|internet|broadband|gas|rent|recharge|mobile bill|phone bill|bill|bills|emi|insurance|dth|maintenance)\b/, /bill|utilit|rent/i],
  [/\b(movie|movies|netflix|spotify|prime|hotstar|game|games|concert|party|outing|cinema|subscription|youtube)\b/, /entertain/i],
  [/\b(doctor|medicine|medicines|pharmacy|hospital|clinic|medical|dentist|checkup|health|tablet|tablets|lab test)\b/, /health|medic/i],
  [/\b(school|college|tuition|course|fees|fee|books|book|exam|class|coaching|udemy)\b/, /educat/i],
  [/\b(salary|payroll|stipend)\b/, /salary/i],
  [/\b(freelance|freelancing|client|project payment|gig)\b/, /freelanc/i],
];

function pickCategory(text, categories, type) {
  const list = (categories || []).filter((c) => c && c.name);
  if (!list.length) return null;
  const hit = (re) => list.find((c) => re.test(c.name));
  text = text + ' ' + text.replace(/\b([a-z]{3,})s\b/g, '$1'); // "coffees" also matches "coffee"
  // the user said the category name itself ("transport", "healthcare")
  for (const c of list) {
    const words = c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && w !== 'other');
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(text))) return c;
  }
  for (const [kw, catRe] of KEYWORDS) if (kw.test(text)) { const c = hit(catRe); if (c) return c; }
  if (type === 'income') return hit(/^(other|income)/i) || null;
  return hit(/^other/i) || null;
}

const LEADING = new Set(['i', 'we', 'my', 'me', 'just', 'also', 'then', 'had', 'have', 'has', 'was', 'were', 'am', 'is', 'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'purchased', 'ordered', 'gave', 'give', 'sent', 'got', 'received', 'earned', 'credited', 'deposited', 'lost', 'for', 'on', 'to', 'of', 'at', 'a', 'an', 'the', 'worth', 'about', 'around', 'only', 'add', 'expense', 'income', 'transaction', 'entry', 'new', 'record', 'log', 'please', 'by', 'from', 'in', 'with', 'and', 'cost', 'costs', 'costing', 'total', 'amount', 'bill', 'it']);

function titleFrom(words, categoryName, type) {
  let w = words.filter((x) => /[a-z0-9&]/.test(x));
  while (w.length && LEADING.has(w[0])) w.shift();
  while (w.length && LEADING.has(w[w.length - 1])) w.pop();
  let t = w.join(' ').replace(/\s+/g, ' ').trim();
  if (!t) t = categoryName && !/^other$/i.test(categoryName) ? categoryName : (type === 'income' ? 'Income' : 'Expense');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function detectType(text) {
  const exp = EXPENSE_WORDS.test(text);
  if (exp) return 'expense';
  if (INCOME_STRONG.test(text) || INCOME_GOT.test(text)) return 'income';
  return 'expense';
}

// Chooses which number in a sentence is the money amount.
function pickAmount(pieces) {
  const nums = pieces.map((p, i) => ({ p, i })).filter(({ p }) => p.t === 'num' && p.value > 0);
  const usable = nums.filter(({ i }) => {
    const next = pieces[i + 1]?.text;
    if (next === 'am' || next === 'pm' || next === 'a' && pieces[i + 2]?.text === 'm') return false; // a time like "8 pm"
    if (next === '%' || next === 'percent') return false;
    return true;
  });
  if (!usable.length) return null;
  const marked = usable.filter(({ i }) => {
    const prev = pieces[i - 1]?.text, next = pieces[i + 1]?.text;
    return CURRENCY.has(prev) || CURRENCY.has(next) || prev === '₹' ||
      ['for', 'worth', 'cost', 'costs', 'costing', 'of'].includes(prev) || ['rs', 'rupees'].includes(next);
  });
  const pool = marked.length ? marked : usable;
  // when nothing is marked, "bought 2 coffees 150" -> the biggest number is almost always the price
  return pool.reduce((a, b) => (b.p.value > a.p.value ? b : a));
}

function parseOne(segment, categories, today, fallbackDate) {
  let text = segment;
  const d = takeDate(text, today);
  let date = fallbackDate;
  if (d) { date = d.date; text = d.text; }
  const pieces = readNumbers(tokenize(text));
  const chosen = pickAmount(pieces);
  if (!chosen) return null;
  const amount = Math.round(chosen.p.value * 100) / 100;
  const rest = pieces.filter((_, i) => i !== chosen.i).map((p) => p.text);
  const type = detectType(text);
  const cat = pickCategory(text, categories, type);
  const words = rest.filter((x) => !CURRENCY.has(x));
  return { title: titleFrom(words, cat?.name, type), amount, type, category_id: cat ? cat.id : '', date: date || today, note: 'Added by voice' };
}

// Cuts a sentence into pieces at "and", "then", "also", commas and semicolons.
function splitSegments(text) {
  const protectedText = text.replace(/(\d),(\d)/g, '$1§$2');
  const parts = protectedText.split(/\s*(?:[;,]|\band then\b|\bthen\b|\balso\b|\band\b|\bplus\b)\s*/).map((s) => s.replace(/§/g, ',').trim()).filter(Boolean);
  const hasAmount = (s) => readNumbers(tokenize(s)).some((p) => p.t === 'num' && p.value > 0);
  // a piece with no amount ("tea" in "200 on lunch and tea") belongs to the piece before it
  const merged = [];
  for (const p of parts) {
    if (!hasAmount(p) && merged.length) merged[merged.length - 1] += ' and ' + p;
    else merged.push(p);
  }
  return merged;
}

// Words like "and" inside number words ("two hundred and fifty") must survive splitting, so numbers are joined first.
function joinNumberWords(text) {
  return text.replace(/\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lakhs|crore|a|\d+) )+)and (?=(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)\b)/g,
    (m, a) => (/(hundred|thousand|lakh|lakhs|crore)\s$/.test(a) ? a + '&& ' : m));
}

// Main entry. Returns a list of { title, amount, type, category_id, date, note }.
export function parseSpoken(input, categories = [], today = localToday()) {
  let text = String(input || '').toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/₹/g, ' rs ')
    .replace(/\brs\.\s*/g, 'rs ')
    .replace(/\s+/g, ' ').trim();
  if (!text) return [];
  text = joinNumberWords(text);
  const global = takeDate(text, today); // a date said once ("yesterday I spent ... and ...") applies to every piece
  const fallbackDate = global ? global.date : today;
  const segs = splitSegments(text).map((s) => s.replace(/&&/g, 'and'));
  const items = [];
  for (const s of segs) {
    const hasOwnDate = !!takeDate(s, today);
    const r = parseOne(s, categories, today, hasOwnDate ? null : fallbackDate);
    if (r) items.push(r);
  }
  return items;
}