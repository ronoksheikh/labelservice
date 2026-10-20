export const SITE = {
  name: 'twobytes.dev',
  url: 'https://twobytes.dev',
  tagline: 'Practical courses for builders, made in Bangladesh.',
  description:
    'twobytes.dev is a small course platform run by two developers in Bangladesh. Learn practical, real-world skills with short, focused video courses, priced in Taka.',
  founders: ['Fahimun Tasin', 'Ronok Sheikh'],
  locale: 'en_BD',
} as const;

const grouping = new Intl.NumberFormat('en-IN');

/** Whole Taka with Bangladeshi digit grouping: ৳1,25,000. */
export const taka = (amount: number) => `৳${grouping.format(Math.round(amount))}`;

export const isBdPhone = (phone: string) => /^01[3-9]\d{8}$/.test(phone);
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

/** "01712-345678", "+8801712345678" or "8801712345678" become "01712345678". */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('880') ? `0${digits.slice(3)}` : digits.startsWith('1') && digits.length === 10 ? `0${digits}` : digits;
}

export const slugify = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

/** Turn a YouTube, Vimeo or other video link into something the player can show. */
export function videoEmbed(url: string): { kind: 'iframe' | 'file'; src: string } | null {
  const value = url.trim();
  if (!value) return null;
  const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(value);
  if (youtube) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0&modestbranding=1` };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/.exec(value);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}${vimeo[2] ? `?h=${vimeo[2]}` : ''}` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(value)) return { kind: 'file', src: value };
  return /^https:\/\//.test(value) ? { kind: 'iframe', src: value } : null;
}
