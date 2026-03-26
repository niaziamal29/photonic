export function parseBuildIdParam(
  buildId: string | string[] | undefined,
): number | null {
  if (typeof buildId !== "string") {
    return null;
  }

  const parsedBuildId = Number.parseInt(buildId, 10);
  return Number.isNaN(parsedBuildId) ? null : parsedBuildId;
}
