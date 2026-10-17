interface Props {
  src?: string | null;
  title: string;
  className?: string;
}

export default function MusicCover({ src, title, className = '' }: Props) {
  return (
    <div className={`music-cover-fallback ${className}`} aria-hidden="true">
      {src && <img src={src} alt="" onError={(event) => { event.currentTarget.remove(); }} />}
      <span>{title.slice(0, 1).toUpperCase() || '♪'}</span>
    </div>
  );
}
