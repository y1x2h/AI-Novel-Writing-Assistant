import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BlurbCandidate, BlurbGenerationInput } from "@ai-novel/shared/types/blurb";
import { BLURB_MAX_COUNT, BLURB_MIN_COUNT } from "@ai-novel/shared/types/blurb";
import { z } from "zod";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { validate } from "../../../../middleware/validate";
import { blurbGenerationService } from "../../../../services/novel/blurb/BlurbGenerationService";

const blurbGenerateSchema = z
  .object({
    provider: llmProviderSchema.optional(),
    model: z.string().trim().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(256).max(32768).optional(),
    count: z.number().int().min(BLURB_MIN_COUNT).max(BLURB_MAX_COUNT).optional(),
    novelId: z.string().trim().min(1).optional(),
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    genreLabel: z.string().trim().max(120).optional(),
    bookSellingPoint: z.string().trim().max(600).optional(),
    competingFeel: z.string().trim().max(600).optional(),
    first30ChapterPromise: z.string().trim().max(600).optional(),
    targetAudience: z.string().trim().max(600).optional(),
    commercialTags: z.array(z.string().trim().min(1).max(20)).max(6).optional(),
  })
  .refine((value) => Boolean(
    value.novelId?.trim()
    || value.description?.trim()
    || value.title?.trim()
    || value.bookSellingPoint?.trim(),
  ), {
    message: "请至少提供一本小说，或填写书名、概述、核心卖点中的任意一项。",
  });

interface RegisterNovelBlurbRoutesInput {
  router: Router;
}

export function registerNovelBlurbRoutes(input: RegisterNovelBlurbRoutesInput): void {
  const { router } = input;

  router.post(
    "/blurb/generate",
    validate({ body: blurbGenerateSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as z.infer<typeof blurbGenerateSchema>;
        const data = body.novelId?.trim()
          ? await blurbGenerationService.generateForNovel(body.novelId.trim(), body)
          : await blurbGenerationService.generate(body as BlurbGenerationInput);
        res.status(200).json({
          success: true,
          data,
          message: "Blurb candidates generated.",
        } satisfies ApiResponse<{ candidates: BlurbCandidate[] }>);
      } catch (error) {
        next(error);
      }
    },
  );
}
