const dhaka = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export const dateTime = (value: string | null | undefined) => (value ? dhaka.format(new Date(value)) : '—');
export const taka = (value: number) => `৳${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
export const shareUrl = (token: string) => `${window.location.origin}/p/${token}`;
