// A section's big lowercase title with a serif tagline above it. Every "o"
// gets a solid dot in its counter, alternating turquoise and terracotta, and
// the last word is set in the accent colour.
export function SectionHero({ title, tagline }: { title: string; tagline: string }) {
  const words = title.toLowerCase().split(' ');
  let dots = 0;
  const dotted = (word: string) =>
    word.split(/(o)/).map((part, i) =>
      part === 'o' ? (
        <span key={i} className={`dot ${dots++ % 2 === 0 ? 'turq' : 'terra'}`}>
          o
        </span>
      ) : (
        part
      ),
    );

  return (
    <header className="section-hero">
      <p className="serif section-tagline">{tagline}</p>
      <h2 className="display section-title" aria-label={title}>
        {words.map((word, i) => (
          <span key={i} className={i === words.length - 1 && words.length > 1 ? 'section-title-accent' : undefined}>
            {i > 0 && ' '}
            {dotted(word)}
          </span>
        ))}
      </h2>
    </header>
  );
}
