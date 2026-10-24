import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";
import { fmt as money, useCurrency, symbol, compact } from "../utils/currency";

const fmt = (n) => money(n, 0);
const pad = n => String(n).padStart(2, "0");
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseYMD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dayLabel = s => parseYMD(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const longLabel = s => parseYMD(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const daysFrom = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 86400000);

const HORIZONS = [30, 60, 90];

// ───────── chart ─────────
const W = 800, H = 280, PAD = { l: 64, r: 16, t: 14, b: 28 };

function niceStep(range, ticks) {
  const raw = range / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}
const short = (n) => compact(n);

function Chart({ points, events }) {
  const [hover, setHover] = useState(null); // index into points
  const boxRef = useRef(null);

  const geo = useMemo(() => {
    const vals = points.map(p => p.balance);
    let lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
    if (hi === lo) { hi = lo + 1000; }
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const x = i => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
    const y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
    const base = y(Math.max(lo, 0));
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
    const labelIdx = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (points.length - 1)));
    return { x, y, ticks, line, area, zeroY: y(0), labelIdx, lo, hi };
  }, [points]);

  const eventsByDate = useMemo(() => {
    const m = new Map();
    for (const e of events) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); }
    return m;
  }, [events]);
  const dotDates = useMemo(() => [...eventsByDate.keys()], [eventsByDate]);
  const indexByDate = useMemo(() => new Map(points.map((p, i) => [p.date, i])), [points]);

  const move = e => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    const f = (vx - PAD.l) / (W - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
  };

  const hp = hover != null ? points[hover] : null;
  const hEvents = hp ? eventsByDate.get(hp.date) || [] : [];
  const leftPct = hover != null ? (geo.x(hover) / W) * 100 : 0;

  return (
    <div className="relative" ref={boxRef} onPointerMove={move} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block text-brand-500" role="img"
        aria-label="Projected balance over the coming days">
        <defs>
          <clipPath id="fc-above"><rect x="0" y="0" width={W} height={Math.max(0, geo.zeroY)} /></clipPath>
          <clipPath id="fc-below"><rect x="0" y={geo.zeroY} width={W} height={Math.max(0, H - geo.zeroY)} /></clipPath>
        </defs>

        {/* grid + y labels */}
        {geo.ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)}
              className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" />
            <text x={PAD.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="11"
              className="fill-slate-400 dark:fill-slate-500">{short(v)}</text>
          </g>
        ))}
        {/* x labels */}
        {geo.labelIdx.map((i, k) => (
          <text key={i} x={geo.x(i)} y={H - 8} fontSize="11"
            textAnchor={k === 0 ? "start" : k === geo.labelIdx.length - 1 ? "end" : "middle"}
            className="fill-slate-400 dark:fill-slate-500">{dayLabel(points[i].date)}</text>
        ))}
        {/* zero line */}
        {geo.lo < 0 && (
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.zeroY} y2={geo.zeroY}
            className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" strokeDasharray="4 4" />
        )}

        {/* area + line: blue above zero, red below zero */}
        <g clipPath="url(#fc-above)">
          <path d={geo.area} fill="currentColor" opacity="0.10" />
          <path d={geo.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        <g clipPath="url(#fc-below)" className="text-red-500">
          <path d={geo.area} fill="currentColor" opacity="0.14" />
          <path d={geo.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* event markers */}
        {dotDates.map(d => {
          const i = indexByDate.get(d);
          if (i == null) return null;
          const list = eventsByDate.get(d);
          const net = list.reduce((s, e) => s + (e.type === "income" ? e.amount : -e.amount), 0);
          return <circle key={d} cx={geo.x(i)} cy={geo.y(points[i].balance)} r="4"
            className={`${net >= 0 ? "fill-emerald-500" : "fill-amber-500"} stroke-white dark:stroke-surface`} strokeWidth="2" />;
        })}

        {/* hover */}
        {hp && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b}
              className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" />
            <circle cx={geo.x(hover)} cy={geo.y(hp.balance)} r="5" fill="currentColor"
              className={`${hp.balance < 0 ? "text-red-500" : ""} stroke-white dark:stroke-surface`} strokeWidth="2" />
          </g>
        )}
      </svg>

      {hp && (
        <div className="absolute top-2 pointer-events-none z-10 px-3 py-2 rounded-xl text-xs shadow-lg
                        bg-raised border border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200"
          style={{ left: `${leftPct}%`, transform: `translateX(${leftPct > 60 ? "-105%" : "5%"})`, minWidth: 140 }}>
          <p className="text-slate-400 dark:text-slate-500">{longLabel(hp.date)}</p>
          <p className={`font-mono font-semibold text-sm ${hp.balance < 0 ? "text-red-500" : ""}`}>{fmt(hp.balance)}</p>
          {hEvents.map((e, i) => (
            <p key={i} className="mt-0.5 truncate max-w-[200px]">
              <span className={e.type === "income" ? "text-emerald-500" : "text-amber-500"}>{e.type === "income" ? "+" : "-"}{fmt(e.amount)}</span>{" "}{e.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── page ─────────
function Stat({ label, value, sub, tone }) {
  return (
    <div className="bg-surface border border-slate-100 dark:border-white/5 rounded-2xl p-4">
      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${tone || "text-slate-900 dark:text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ForecastPage() {
  useCurrency();
  const [days, setDays] = useState(30);
  const [dailyText, setDailyText] = useState("");   // what-if daily spending typed by the user
  const [daily, setDaily] = useState("");           // debounced copy of dailyText
  const [result, setResult] = useState(null);       // { key, data } | { key, error }
  const [showAll, setShowAll] = useState(false);

  // wait a moment after typing before asking the server
  useEffect(() => {
    const id = setTimeout(() => setDaily(dailyText.trim()), 400);
    return () => clearTimeout(id);
  }, [dailyText]);

  const key = `${days}|${daily}`;
  useEffect(() => {
    let cancelled = false;
    const params = { days, today: localToday() };
    if (daily !== "" && Number.isFinite(Number(daily)) && Number(daily) >= 0) params.daily = daily;
    api.get("/forecast", { params })
      .then(res => { if (!cancelled) setResult({ key, data: res.data }); })
      .catch(err => { if (!cancelled) setResult({ key, error: err.response?.data?.message || "Could not load the forecast. Please try again." }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = result && result.key === key ? result : null;
  const data = (current || result)?.data;      // keep showing the last forecast while a new one loads
  const loading = !current;
  const error = current?.error;

  const headline = useMemo(() => {
    if (!data) return null;
    if (data.firstNegativeDate) {
      const n = daysFrom(data.today, data.firstNegativeDate);
      return { bad: true, text: `At this pace your balance goes below zero on ${dayLabel(data.firstNegativeDate)} (in ${n} day${n === 1 ? "" : "s"}).` };
    }
    return { bad: false, text: `You're on track. You should still have ${fmt(data.endBalance)} on ${dayLabel(data.points[data.points.length - 1].date)}.` };
  }, [data]);

  const events = data?.events || [];
  const shown = showAll ? events : events.slice(0, 10);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Cash-flow forecast</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Where your balance is heading, based on your recurring items and spending habits.</p>
          </div>
          <div className="ml-auto flex rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-surface">
            {HORIZONS.map(h => (
              <button key={h} onClick={() => setDays(h)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${days === h
                  ? "bg-brand-500 text-white"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                {h} days
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/20">{error}</div>
        )}

        {!data && !error && <p className="text-sm text-slate-400 py-16 text-center">Working out your forecast…</p>}

        {data && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {/* Headline */}
            <div className={`mb-4 px-4 py-3 rounded-2xl text-sm font-medium border ${headline.bad
              ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-100 dark:border-red-500/20"
              : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/20"}`}>
              {headline.bad ? "⚠️ " : "✅ "}{headline.text}
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Stat label="Balance today" value={fmt(data.startBalance)} tone={data.startBalance < 0 ? "text-red-500" : undefined} />
              <Stat label={`In ${data.horizon} days`} value={fmt(data.endBalance)} tone={data.endBalance < 0 ? "text-red-500" : undefined}
                sub={`${data.endBalance - data.startBalance >= 0 ? "+" : "-"}${fmt(Math.abs(data.endBalance - data.startBalance))} from today`} />
              <Stat label="Lowest point" value={fmt(data.lowest.balance)} tone={data.lowest.balance < 0 ? "text-red-500" : undefined}
                sub={data.lowest.date === data.today ? "Today" : dayLabel(data.lowest.date)} />
              <Stat label="Safe to spend" value={`${fmt(data.safeDaily)}/day`} sub="and still end at zero or above" />
            </div>

            {/* Chart */}
            <div className="bg-surface border border-slate-100 dark:border-white/5 rounded-2xl p-4 mb-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-slate-400 dark:text-slate-500">
                <span className="font-semibold text-slate-600 dark:text-slate-300 text-sm">Projected balance</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Money coming in</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Bill or planned payment</span>
              </div>
              {/* on a phone the chart keeps a readable size and can be swiped sideways */}
              <div className="overflow-x-auto -mx-1 px-1"><div className="min-w-[560px]"><Chart points={data.points} events={events} /></div></div>
            </div>

            <div className="grid lg:grid-cols-5 gap-4">
              {/* What-if */}
              <div className="lg:col-span-2 bg-surface border border-slate-100 dark:border-white/5 rounded-2xl p-4 self-start">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-1">Everyday spending</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
                  {data.confidence === "none"
                    ? "There is not enough spending history yet to guess your daily habit, so the line only includes bills and income. Type an amount to try it."
                    : data.confidence === "custom"
                      ? "You are trying your own number. Clear it to go back to your real habit."
                      : `We use your usual spending (food, travel, shopping and so on) over the last ${data.basisDays} days${data.confidence === "low" ? ". That is not much history, so treat it as a rough guess" : ""}. Bills are counted separately.`}
                </p>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">What if I spend per day</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol()}</span>
                    <input type="number" min="0" inputMode="decimal" value={dailyText}
                      onChange={e => setDailyText(e.target.value)}
                      placeholder={String(Math.round(data.confidence === "custom" ? 0 : data.dailySpend))}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
                                 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
                                 focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20" />
                  </div>
                  {dailyText !== "" && (
                    <button onClick={() => { setDailyText(""); setDaily(""); }}
                      className="px-3 rounded-xl text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:border-brand-400 hover:text-brand-500">Reset</button>
                  )}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Right now the forecast assumes <span className="font-semibold text-slate-600 dark:text-slate-300">{fmt(data.dailySpend)}</span> a day.
                </p>
              </div>

              {/* Upcoming */}
              <div className="lg:col-span-3 bg-surface border border-slate-100 dark:border-white/5 rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Coming up</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    <span className="text-emerald-500 font-mono">+{fmt(data.upcomingIncome)}</span>{" · "}
                    <span className="text-amber-500 font-mono">-{fmt(data.upcomingBills)}</span>
                  </p>
                </div>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Nothing scheduled in the next {data.horizon} days. Add your salary and bills on the Recurring page to make this more accurate.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {shown.map((e, i) => (
                      <li key={`${e.date}-${e.title}-${i}`} className="flex items-center gap-3 py-2">
                        <span className="w-14 shrink-0 text-xs text-slate-400 dark:text-slate-500">{dayLabel(e.date)}</span>
                        <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">{e.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500">{e.source === "recurring" ? "Recurring" : "Planned"}</span>
                        <span className={`text-sm font-mono font-semibold ${e.type === "income" ? "text-emerald-500" : "text-slate-700 dark:text-slate-200"}`}>
                          {e.type === "income" ? "+" : "-"}{fmt(e.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {events.length > 10 && (
                  <button onClick={() => setShowAll(s => !s)} className="mt-2 text-xs font-medium text-brand-500 hover:text-brand-600">
                    {showAll ? "Show fewer" : `Show all ${events.length}`}
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-600 mt-4">
              This is an estimate. It does not include irregular income (like freelance payments) and assumes your spending stays about the same.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}