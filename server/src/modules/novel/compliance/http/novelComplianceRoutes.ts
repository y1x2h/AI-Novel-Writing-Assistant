import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { NOVEL_COMPLIANCE_SCOPES } from "@ai-novel/shared/types/novelCompliance";
import { z } from "zod";
import { authMiddleware } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { novelComplianceService } from "../application/NovelComplianceService";

const router = Router();

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const precheckBodySchema = z.object({
  scope: z.enum(NOVEL_COMPLIANCE_SCOPES).default("planning"),
});

router.use(authMiddleware);

router.get(
  "/:id/compliance",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelComplianceService.getLatestReport(id);
      res.status(200).json({
        success: true,
        data,
        message: data ? "Latest compliance report loaded." : "No compliance report yet.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/compliance/precheck",
  validate({ params: idParamsSchema, body: precheckBodySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { scope } = req.body as z.infer<typeof precheckBodySchema>;
      const data = await novelComplianceService.runPrecheck(id, scope);
      res.status(201).json({
        success: true,
        data,
        message: "Compliance precheck finished.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
