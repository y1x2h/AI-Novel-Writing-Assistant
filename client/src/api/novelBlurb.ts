import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BlurbCandidate, BlurbGenerationInput } from "@ai-novel/shared/types/blurb";
import { apiClient } from "./client";

export async function generateNovelBlurb(payload: BlurbGenerationInput) {
  const { data } = await apiClient.post<ApiResponse<{ candidates: BlurbCandidate[] }>>(
    "/novels/blurb/generate",
    payload,
  );
  return data;
}
