import { colors, font } from '../lib/theme';

// Prosty wykres słupkowy poziomy — jedyna forma wykresu użyta w statystykach.
//
// Dlaczego akurat taka: wszystkie pytania, na które odpowiadają te strony
// ("kto kontrolował najwięcej", "która pozycja była obsadzana najdłużej",
// "który event był największy"), to porównanie WIELKOŚCI między kategoriami —
// a do tego słupek poziomy jest formą domyślną: nazwy kategorii mieszczą się
// w całości bez obracania tekstu i lista sortuje się naturalnie malejąco.
//
// Każdy słupek ma etykietę tekstową obok siebie i wartość liczbową na końcu,
// więc kolor niczego nie koduje — jest tylko powtórzeniem tego, co i tak
// napisane. To celowe: paleta typów pozycji w tej aplikacji (CTR czerwony,
// APP złoty, TWR niebieski, GND zielony, DEL fioletowy) jest utrwalona w
// całym interfejsie, ale para czerwony/złoty jest trudna do rozróżnienia przy
// deuteranopii. Zamiast zmieniać kolory znane użytkownikom, tożsamość niesie
// tekst, a kolor pozostaje ozdobą.
export default function StatBars({ items, formatValue = (v) => String(v), emptyText = 'Brak danych.' }) {
  const list = (items || []).filter((i) => i && Number.isFinite(Number(i.value)));
  if (list.length === 0) {
    return <p style={{ color: colors.mutedDim, fontSize: '0.85rem', margin: '4px 0 0' }}>{emptyText}</p>;
  }
  const max = Math.max(...list.map((i) => Number(i.value)), 1);

  return (
    <div style={styles.wrap}>
      {list.map((item, idx) => {
        const pct = Math.max(1.5, (Number(item.value) / max) * 100);
        return (
          <div key={item.key ?? idx} style={styles.row} title={item.title || `${item.label}: ${formatValue(item.value)}`}>
            <div style={styles.labelCol}>
              <div style={styles.label}>{item.label}</div>
              {item.sub && <div style={styles.sub}>{item.sub}</div>}
            </div>
            <div style={styles.track}>
              <div
                style={{
                  ...styles.bar,
                  width: `${pct}%`,
                  background: item.color || colors.amber,
                }}
              />
            </div>
            <div style={styles.value}>{formatValue(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  wrap: { display: 'grid', gap: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  labelCol: { width: 210, flexShrink: 0, minWidth: 0 },
  label: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: colors.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    fontSize: '0.75rem',
    color: colors.mutedDim,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  track: {
    flex: 1,
    minWidth: 60,
    height: 14,
    borderRadius: 4,
    background: colors.cardAlt,
    overflow: 'hidden',
  },
  // Zaokrąglony tylko koniec słupka — początek jest przyklejony do osi.
  bar: { height: '100%', borderRadius: '2px 4px 4px 2px' },
  value: {
    width: 92,
    flexShrink: 0,
    textAlign: 'right',
    fontFamily: font.mono,
    fontSize: '0.82rem',
    color: colors.muted,
  },
};
