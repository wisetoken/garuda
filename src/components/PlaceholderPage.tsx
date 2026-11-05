type PlaceholderPageProps = {
  section: string;
  title: string;
  description: string;
  placeholder: string;
};

export function PlaceholderPage({ section, title, description, placeholder }: PlaceholderPageProps) {
  return (
    <>
      <title>{`${section} | WiseOne | Garuda Extension`}</title>
      <div className="page-label"><span>{section}</span><span className="preview-badge">In development</span></div>
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
      <section className="placeholder" aria-label={`${section} preview`}>
        <span className="placeholder-symbol" aria-hidden="true">G</span>
        <h2>{placeholder}</h2>
        <p>This is the app structure. Live data and wallet actions will be added in later versions.</p>
      </section>
    </>
  );
}
