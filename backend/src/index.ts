import 'dotenv/config';
import { createApp } from "./app.js";
import { env } from "./config/env.js";

createApp().listen(env.PORT, "0.0.0.0", () => {
  console.log(`APEX API listening on :${env.PORT}`);
});
