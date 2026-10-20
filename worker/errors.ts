export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
export const badRequest = (message: string): never => { throw new HttpError(400, message); };
export const notFound = (message = 'Not found.'): never => { throw new HttpError(404, message); };
