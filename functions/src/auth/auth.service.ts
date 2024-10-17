import {
    createUserWithEmailAndPassword,
    getAuth,
    signInWithEmailAndPassword,
    User,
} from "firebase/auth";

export const signInAuthService = async ({email, password}: {
    email: string;
    password: string;
}): Promise<User> => {
    const auth = getAuth();
    try {
        return signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed up
                return userCredential.user;
            });
    } catch (error: any) {
        const errorCode = error.code;
        const errorMessage = error.message;
        throw new Error(`${errorCode}: ${errorMessage}`);
    }
};

export const signUpAuthService = async ({email, password}: {
    email: string;
    password: string;
}): Promise<User> => {
    const auth = getAuth();
    try {
        return createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed up
                return userCredential.user;
            });
    } catch (error: any) {
        const errorCode = error.code;
        const errorMessage = error.message;
        throw new Error(`${errorCode}: ${errorMessage}`);
    }
};
