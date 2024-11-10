import { logger } from 'firebase-functions/v2';

export const signInService = (body: { userName: string; password: string }) => {
  logger.info('auth.service.signInService');
  try {
    const { userName, password } = body;
    if (userName === 'finndo' && password === 'test') {
      return {
        user: { avatar: '', userName: 'finndo', email: '', authority: [] },
        token: 'wVYrxaeNa9OxdnULvde1Au5m5w63',
      };
    }

    return false;
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode} ${errorMessage}`);
  }
};
