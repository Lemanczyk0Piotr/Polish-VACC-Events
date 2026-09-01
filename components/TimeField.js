import { useEffect, useState } from 'react';
import { shared } from '../lib/theme';

// A plain "HH:MM" text field, used everywhere instead of native
// <input type="time">. The native control's picker (and the AM/PM vs 24h
// display it shows) follows the browser/OS locale, which is out of our
// control and was showing AM/PM for some visitors even though every time in
// this app is meant to be read as 24h zulu. This field always displays and
// accepts 24h "HH:MM", regardless of the visitor's locale.
export default function TimeField({ value, onChange, style }) {
  const [text, setText] = useState(value || '');

  // Keep in sync if the parent resets/changes the value from elsewhere
  // (e.g. a default recalculated after loading assignments).
  useEffect(() => {
    setText(value || '');
  }, [value]);

  const commit = (raw) => {
    const cleaned = raw.trim();
    if (!cleaned) {
      setText('');
      onChange('');
      return;
    }
    const m = cleaned.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (!m) {
      // Invalid entry — revert to the last known-good value.
      setText(value || '');
      return;
    }
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
    const mm = Math.min(59, Math.max(0, parseInt(m[2] || '0', 10) || 0));
    const formatted = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    setText(formatted);
    onChange(formatted);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      maxLength={5}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      style={{ ...shared.input, width: 84, textAlign: 'center', fontFamily: 'monospace', ...style }}
    />
  );
}
