// import {app} from "../index";
// import {getAuth, signOut} from "firebase/auth";
// import {signInAuthService, signUpAuthService} from "./auth.service";

// app.get("/api/sign-in", async (req, res): Promise<any> => {
//   try {
//     const {email, password} = JSON.parse(req.body);
//     const user = await signInAuthService({email, password});
//     return res.status(200).send({user});
//   } catch (error: any) {
//     const errorCode = error.code;
//     const errorMessage = error.message;
//     return res.status(errorCode).send({error: errorMessage});
//   }
// });

// app.post("/api/sign-up", async (req, res): Promise<any> => {
//   const {email, password} = JSON.parse(req.body);
//   try {
//     const user = await signUpAuthService({email, password});
//     return res.status(200).send({user});
//   } catch (error: any) {
//     const errorCode = error.code;
//     const errorMessage = error.message;
//     return res.status(errorCode).send({error: errorMessage});
//   }
// });

// app.post("/api/sign-out", async (req, res) => {
//   const auth = getAuth();
//   signOut(auth).then(() => {
//     // Sign-out successful.
//     return true;
//   }).catch((error: any) => {
//     // An error happened.
//     const errorCode = error.code;
//     const errorMessage = error.message;
//     return res.status(errorCode).send({error: errorMessage});
//   });
// });
