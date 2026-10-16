import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Lightbulb, MessageCircle, Sparkles, Video } from 'lucide-react';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { LessonCta as Cta } from '@/types';

// Self-hosted at build time (CSP font-src 'self'); full Vietnamese glyphs.
const ctaFont = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap' });

interface Props {
  cta: Cta;
  // Where a card sits: in the corner of the video (desktop) or under it (phones).
  placement?: 'corner' | 'inline';
  nextLessonTitle?: string;
  onAction: () => void;
  onClose: () => void;
  onNextLesson?: () => void;
  onResume?: () => void;
}

// The cards are daisyUI's card examples (daisyui.com/components/card) with daisyUI's own CSS
// (styles/daisy-cta.css, classes dz-*); only the primary colour changes. The admin preview
// (src/admin/learningCta.js) renders the same markup.
const PALETTE: Record<string, [string, string]> = {
  zalo: ['#0068FF', '#FFFFFF'],
  indigo: ['oklch(45% .24 277.023)', 'oklch(93% .034 272.788)'],
  amber: ['#F59E0B', '#3B2300'],
  green: ['oklch(76% .177 163.223)', 'oklch(37% .077 168.94)'],
  pink: ['oklch(65% .241 354.308)', 'oklch(94% .028 342.258)'],
  red: ['oklch(58% .22 25)', '#FFFFFF'],
  neutral: ['oklch(14% .005 285.823)', 'oklch(92% .004 286.32)'],
};
const AUTO: Record<string, string> = { zalo: 'zalo', zoom: 'indigo', link: 'amber', message: 'neutral' };
const LABELS: Record<string, string> = { zalo: 'Zalo', zoom: 'Zoom', link: 'Ưu đãi', message: 'Lời nhắn' };
const ICONS = { zalo: MessageCircle, zoom: Video, link: Sparkles, message: Lightbulb };

type Layout = { figure?: 'top' | 'bottom' | 'padded' | 'side' | 'full'; card?: string; flat?: boolean; center?: boolean; start?: boolean; titleBadge?: boolean; closeTop?: boolean; plainButton?: boolean; pricing?: boolean };
const LAYOUTS: Record<string, Layout> = {
  basic: { figure: 'top' },
  badges: { figure: 'top', titleBadge: true },
  bottom: { figure: 'bottom' },
  centered: { figure: 'padded', center: true, start: true },
  plain: {},
  bordered: { card: 'dz-card-border', flat: true },
  dash: { card: 'dz-card-dash', flat: true },
  color: { card: 'bg-[var(--color-primary)] text-[var(--color-primary-content)]', flat: true, plainButton: true },
  neutral: { card: 'bg-[var(--color-neutral)] text-[var(--color-neutral-content)]', flat: true, center: true },
  close: { closeTop: true },
  side: { card: 'dz-card-side', figure: 'side' },
  imagefull: { card: 'dz-image-full', figure: 'full' },
  pricing: { pricing: true },
};

export function ctaColors(cta: Pick<Cta, 'type' | 'color'>): CSSProperties {
  const [primary, content] = PALETTE[cta.color && cta.color !== 'auto' ? cta.color : AUTO[cta.type] || 'indigo'] || PALETTE.indigo;
  return { '--color-primary': primary, '--color-primary-content': content } as CSSProperties;
}

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="me-2 inline-block size-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
  </svg>
);

interface CardProps { cta: Cta; secondaryLabel: string; onAction: () => void; onSecondary: () => void; onClose: () => void; className?: string; headingId: string }

// One daisyUI card in the CTA's template.
function CtaCard({ cta, secondaryLabel, onAction, onSecondary, onClose, className = '', headingId }: CardProps) {
  const layout = LAYOUTS[cta.variant] || LAYOUTS.basic;
  const Icon = ICONS[cta.type] || Lightbulb;
  const hasAction = cta.type !== 'message' && !!cta.button_label;
  const fallback = (rounded = '') => (
    <div className={`grid w-full place-items-center ${layout.figure === 'side' ? 'h-full min-h-40' : layout.figure === 'full' ? 'h-full' : 'aspect-[2/1]'} ${rounded}`}
      style={{ background: layout.figure === 'full' ? 'linear-gradient(135deg, color-mix(in oklab, var(--color-primary) 45%, #000), #0b0b10)' : 'linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 45%, #fff))' }}>
      <Icon className={layout.figure === 'full' ? 'hidden' : 'h-12 w-12 text-[var(--color-primary-content)]'} strokeWidth={1.6} aria-hidden="true" />
    </div>
  );
  const figure = layout.figure ? (
    <figure className={layout.figure === 'padded' ? 'px-10 pt-10' : layout.figure === 'side' ? 'w-2/5 max-w-40 shrink-0' : ''}>
      {cta.image ? <img src={cta.image} alt="" className={layout.figure === 'padded' ? 'rounded-xl' : layout.figure === 'side' ? 'h-full w-full object-cover' : 'w-full'} /> : fallback(layout.figure === 'padded' ? 'rounded-xl' : '')}
    </figure>
  ) : null;
  const primaryButton = hasAction ? (
    <button type="button" data-cta-primary onClick={onAction} className={`dz-btn ${layout.plainButton ? '' : 'dz-btn-primary'} ${layout.pricing ? 'dz-btn-block' : ''}`}>{cta.button_label}</button>
  ) : null;
  const secondaryButton = secondaryLabel ? (
    <button type="button" onClick={onSecondary} className={`dz-btn dz-btn-ghost ${layout.pricing ? 'dz-btn-block' : ''}`}>{secondaryLabel}</button>
  ) : null;
  const overImage = layout.figure === 'top' || layout.figure === 'full';
  const close = layout.closeTop ? null : (
    <button type="button" aria-label="Đóng" onClick={onClose} className={`dz-btn dz-btn-sm dz-btn-circle ${overImage ? '' : 'dz-btn-ghost'} absolute right-2 top-2 z-10`}>✕</button>
  );
  const lines = cta.body.split('\n').map(line => line.trim()).filter(Boolean);
  const body = layout.pricing ? (
    <div className="dz-card-body">
      <span className="dz-badge dz-badge-xs dz-badge-warning">{LABELS[cta.type]}</span>
      <div className="flex justify-between pe-8"><h2 id={headingId} className="text-3xl font-bold">{cta.title}</h2></div>
      {lines.length ? <ul className="mt-6 flex flex-col gap-2 text-xs">{lines.map((line, i) => <li key={i}><CheckIcon /><span>{line}</span></li>)}</ul> : null}
      {primaryButton || secondaryButton ? <div className="mt-6 flex flex-col gap-1">{primaryButton}{secondaryButton}</div> : null}
    </div>
  ) : (
    <div className={`dz-card-body ${layout.center ? 'items-center text-center' : ''}`}>
      {layout.closeTop ? <div className="dz-card-actions justify-end"><button type="button" aria-label="Đóng" onClick={onClose} className="dz-btn dz-btn-square dz-btn-sm"><CloseIcon /></button></div> : null}
      <h2 id={headingId} className={`dz-card-title ${layout.center ? '' : 'pe-8'} ${layout.closeTop ? 'pe-0' : ''}`}>
        {cta.title}{layout.titleBadge ? <div className="dz-badge dz-badge-secondary">{LABELS[cta.type]}</div> : null}
      </h2>
      {cta.body ? <p className="whitespace-pre-line">{cta.body}</p> : null}
      {primaryButton || secondaryButton ? <div className={`dz-card-actions ${layout.start ? '' : 'justify-end'}`}>{secondaryButton}{primaryButton}</div> : null}
    </div>
  );
  return (
    <div className={`dz-card dz-card-${cta.size || 'md'} ${layout.card || ''} ${layout.card?.includes('bg-') ? '' : 'bg-[var(--color-base-100)]'} ${layout.flat ? '' : 'shadow-sm'} ${className}`}>
      {close}
      {layout.figure === 'bottom' ? <>{body}{figure}</> : <>{figure}{body}</>}
    </div>
  );
}

export default function LessonCta({ cta, placement = 'corner', nextLessonTitle, onAction, onClose, onNextLesson, onResume }: Props) {
  const hasAction = cta.type !== 'message' && !!cta.button_label;
  const showNext = cta.trigger === 'end' && !!onNextLesson && !!nextLessonTitle;
  const paused = cta.display !== 'card';
  // Next lesson after the video, resume a paused video, or dismiss a message.
  const secondaryLabel = showNext ? 'Bài tiếp theo' : paused ? (hasAction ? 'Để sau' : 'Xem tiếp bài học') : hasAction ? '' : 'Đã hiểu';
  const onSecondary = () => (showNext ? onNextLesson?.() : paused && onResume ? onResume() : onClose());
  const headingId = `cta-${cta.id}`;
  const shared = { cta, secondaryLabel, onAction, onSecondary, onClose, headingId };

  if (cta.display === 'popup') {
    return (
      <CtaPopup headingId={headingId} onClose={onClose}>
        <div className="dz-theme cta-pop relative w-96 max-w-full" style={ctaColors(cta)}><CtaCard {...shared} className="max-h-[calc(100dvh-32px)] overflow-y-auto shadow-xl" /></div>
      </CtaPopup>
    );
  }
  if (cta.display === 'overlay') {
    // image-full with the paused video as the image: dimmed, light text, actions at the end.
    // The backdrop filter puts the dimming on its own layer above the Vimeo iframe.
    return (
      <div role="dialog" aria-modal="false" aria-labelledby={headingId} className={`${ctaFont.className} dz-theme cta-fade absolute inset-0 z-20 grid overflow-y-auto bg-black/70 backdrop-blur-[2px]`} style={ctaColors(cta)}>
        <button type="button" aria-label="Đóng" onClick={onClose} className="dz-btn dz-btn-sm dz-btn-circle absolute right-2 top-2 z-10">✕</button>
        <div className="dz-card-body mx-auto w-full max-w-xl justify-end text-[var(--color-neutral-content)] sm:justify-center max-sm:[--card-p:1rem]">
          <h2 id={headingId} className="dz-card-title pe-8 max-sm:[--cardtitle-fs:1rem]">{cta.title}</h2>
          {cta.body ? <p className="hidden grow-0 whitespace-pre-line sm:block">{cta.body}</p> : null}
          <div className="dz-card-actions justify-end max-sm:[&_.dz-btn]:[--size:calc(var(--size-field,.25rem)*8)]">
            {secondaryLabel ? <button type="button" onClick={onSecondary} className="dz-btn dz-btn-ghost">{secondaryLabel}</button> : null}
            {hasAction ? <button type="button" data-cta-primary onClick={onAction} className="dz-btn dz-btn-primary">{cta.button_label}</button> : null}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-labelledby={headingId} className={`${ctaFont.className} dz-theme ${placement === 'inline' ? 'cta-slide-up w-full' : 'cta-slide-in w-96 max-w-full'}`} style={ctaColors(cta)}>
      <CtaCard {...shared} className="shadow-lg" />
    </div>
  );
}

// A dialog in the middle of the screen over the whole page (daisyUI modal backdrop); the video is paused.
function CtaPopup({ headingId, onClose, children }: { headingId: string; onClose: () => void; children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focus = layer.current?.querySelector<HTMLElement>('[data-cta-primary]') || layer.current?.querySelector<HTMLElement>('button');
    focus?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div ref={layer} role="dialog" aria-modal="true" aria-labelledby={headingId} className={`${ctaFont.className} fixed inset-0 z-[120] flex items-center justify-center p-4`}>
      <button type="button" aria-label="Đóng" tabIndex={-1} onClick={onClose} className="cta-fade fixed inset-0 cursor-default bg-[oklch(0%_0_0/0.4)]" />
      {children}
    </div>
  );
}
