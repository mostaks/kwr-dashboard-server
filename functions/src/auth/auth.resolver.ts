import { signInService } from './auth.service';

export const signInHandler = (req: any, res: any) => {
  try {
    const isVerified = signInService(req.body);

    return res.status(200).send(isVerified);
  } catch (error) {
    console.error('Error sign in attempt:', error);
    return res.status(500).send({ error: 'Cannot sign in' });
  }
};
