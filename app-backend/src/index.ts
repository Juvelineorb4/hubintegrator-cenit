import express from "express";
import dotenv from "dotenv";
import { appRouter } from "./app.routes";

dotenv.config();

const app = express();

app.use(express.json());
app.use("/api", appRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});