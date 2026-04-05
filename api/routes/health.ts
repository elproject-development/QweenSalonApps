import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

export default router;
