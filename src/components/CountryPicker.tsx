import { useState } from 'react';
import { sfx } from '../audio';
import { COUNTRIES, countryByCode, type Country } from '../data';
import { dueLabel, progressOf, type Deck } from '../review';
import { CONTINENTS, type RegionDef } from '../regions';
import type { PickerTab } from '../store';
import { Badge } from './shared';

const TABS: { id: PickerTab; label: string }[] = [
  { id: 'map', label: 'Regions' },
  { id: 'custom', label: 'Countries' },
  { id: 'review', label: 'Review' },
];

export function PickerTabs({ tab, due, onChange }: { tab: PickerTab; due: number; onChange: (t: PickerTab) => void }) {
  return (
    <div className="picker-tabs" role="tablist" aria-label="What to play">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === tab}
          className="picker-tab"
          onClick={() => {
            if (t.id === tab) return;
            sfx.click();
            onChange(t.id);
          }}
        >
          {t.label}
          {t.id === 'review' && due > 0 && <span className="due-count">{due}</span>}
        </button>
      ))}
    </div>
  );
}

/** Case- and accent-insensitive, so "cote" finds Côte d'Ivoire. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const GROUPS: { def: RegionDef; countries: Country[] }[] = CONTINENTS.map((def) => ({
  def,
  countries: COUNTRIES.filter((c) => c.regions.includes(def.id as never)).sort((a, b) => a.name.localeCompare(b.name)),
}));

/** Every country, grouped by continent in collapsible lists, with a search. Russia and Türkiye sit in two groups. */
export function CountryList({ selected, onChange }: { selected: string[]; onChange: (codes: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const picked = new Set(selected);
  const q = fold(query.trim());

  const set = (codes: string[], on: boolean) => {
    const next = new Set(picked);
    for (const c of codes) {
      if (on) next.add(c);
      else next.delete(c);
    }
    // Keep the list in a stable order, so the saved selection and the link don't reshuffle.
    onChange(COUNTRIES.map((c) => c.code).filter((c) => next.has(c)));
  };
  const toggleGroup = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="country-list">
      <input
        className="cl-search"
        type="search"
        placeholder="Search countries"
        aria-label="Search countries"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="cl-groups">
        {GROUPS.map(({ def, countries }) => {
          const shown = q ? countries.filter((c) => fold(c.name).includes(q)) : countries;
          if (!shown.length) return null;
          const count = countries.filter((c) => picked.has(c.code)).length;
          const allShown = shown.every((c) => picked.has(c.code));
          // A search opens every group with a match; otherwise groups stay as the player left them.
          const isOpen = q ? true : open.has(def.id);
          return (
            <section key={def.id} className="cl-group" data-open={isOpen || undefined} style={{ '--line': def.color } as React.CSSProperties}>
              <div className="cl-head">
                <button className="cl-toggle" aria-expanded={isOpen} onClick={() => toggleGroup(def.id)} disabled={!!q}>
                  <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <Badge region={def} />
                  <span className="cl-name">{def.name}</span>
                  <span className={`cl-count${count ? ' some' : ''}`}>
                    {count}/{countries.length}
                  </span>
                </button>
                <button className="btn-ghost cl-all" onClick={() => set(shown.map((c) => c.code), !allShown)}>
                  {allShown ? 'None' : 'All'}
                </button>
              </div>
              <div className="cl-body">
                <ul className="cl-rows" inert={!isOpen}>
                  {shown.map((c) => (
                    <li key={c.code}>
                      <label className="cl-row">
                        <input type="checkbox" checked={picked.has(c.code)} onChange={(e) => set([c.code], e.target.checked)} />
                        <img src={c.flag} alt="" loading="lazy" />
                        <span>{c.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
        {q && !GROUPS.some((g) => g.countries.some((c) => fold(c.name).includes(q))) && <p className="cl-empty">No country matches “{query}”.</p>}
      </div>
    </div>
  );
}

/** The review deck: what's due now, then what's coming back and when. */
export function ReviewList({ deck, onRemove }: { deck: Deck; onRemove: (code: string) => void }) {
  const now = Date.now();
  const cards = Object.entries(deck)
    .filter(([code]) => countryByCode.has(code))
    .sort(([, a], [, b]) => a.due - b.due);
  const due = cards.filter(([, c]) => c.due <= now).length;

  if (!cards.length)
    return (
      <div className="review-list empty">
        <p>
          <b>Nothing to review yet.</b> Countries you miss, or need more than one try for, collect here.
        </p>
      </div>
    );

  return (
    <div className="review-list">
      <p className="rv-summary">
        <b>{due}</b> due now <span>·</span> {cards.length} in review
      </p>
      <p className="rv-how">Find one first try and it comes back after 1, 3, 7 and 16 days, then it’s learnt. A slip starts it over.</p>
      <ul className="rv-rows">
        {cards.map(([code, card]) => {
          const c = countryByCode.get(code)!;
          const isDue = card.due <= now;
          return (
            <li key={code} className={`rv-row${isDue ? ' due' : ''}`}>
              <img src={c.flag} alt="" loading="lazy" />
              <span className="rv-name">{c.name}</span>
              <span className="rv-steps" aria-label={`${Math.round(progressOf(card) * 100)}% learnt`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} className={i < card.step ? 'on' : ''} />
                ))}
              </span>
              <span className="rv-due">{dueLabel(card, now)}</span>
              <button className="rv-remove" onClick={() => onRemove(code)} aria-label={`Remove ${c.name} from review`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
