export { taka, formatDuration } from '../shared/site';

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' });

export const formatDate = (ms: number) => dateFormat.format(ms);
export const formatDateTime = (ms: number) => dateTimeFormat.format(ms);
export const percent = (value: number) => `${(value * 100).toFixed(value && value < 0.1 ? 1 : 0)}%`;
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
