import { notifications } from '@mantine/notifications';

export const notifyError = (error: unknown) =>
  notifications.show({ color: 'red', title: 'Something went wrong', message: error instanceof Error ? error.message : String(error) });
export const notifySuccess = (message: string, title?: string) =>
  notifications.show({ color: 'teal', title, message });
