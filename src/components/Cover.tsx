import { LogoMark } from './Logo';

export function Cover({ src, alt, eager, radius = 0 }: { src: string; alt: string; eager?: boolean; radius?: number }) {
  return (
    <div className="cover" style={{ borderRadius: radius }}>
      {src ? (
        <img src={src} alt={alt} width={1280} height={720} loading={eager ? 'eager' : 'lazy'} decoding="async"
          {...(eager ? { fetchPriority: 'high' as const } : {})} />
      ) : (
        <div className="cover-fallback"><LogoMark size={48} cutout="#27272a" /></div>
      )}
    </div>
  );
}
