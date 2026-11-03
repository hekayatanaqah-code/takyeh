import { Router } from "express";
import { ReviewServiceCityRequestBody } from "@workspace/api-zod";
import { CityRequestError, listCityRequests, reviewCityRequest } from "../lib/service-city-requests";

export const adminServiceCityRequestsRouter = Router();
adminServiceCityRequestsRouter.get("/", async (_req, res) => res.json(await listCityRequests()));
adminServiceCityRequestsRouter.post("/:id/decision", async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = ReviewServiceCityRequestBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ error: "بيانات مراجعة الطلب غير صحيحة" });
  const actorId = req.adminStaff?.id != null ? `admin_staff_${req.adminStaff.id}` : req.user?.id;
  if (!actorId) return res.status(401).json({ error: "يرجى تسجيل الدخول إلى الإدارة" });
  try {
    return res.json(await reviewCityRequest(id, parsed.data, actorId));
  } catch (error) {
    if (error instanceof CityRequestError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});
