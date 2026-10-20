import { notifications } from '@mantine/notifications';
import { errorMessage } from './api';

export const notifySuccess = (message: string) => notifications.show({ color: 'teal', message });
export const notifyError = (error: unknown) => notifications.show({ color: 'red', title: 'Something went wrong', message: errorMessage(error) });
