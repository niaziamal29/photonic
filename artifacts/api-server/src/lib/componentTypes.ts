import { ComponentType as ApiComponentType } from "@workspace/api-zod";

export const SUPPORTED_COMPONENT_TYPES = Object.values(ApiComponentType) as [
  (typeof ApiComponentType)[keyof typeof ApiComponentType],
  ...(typeof ApiComponentType)[keyof typeof ApiComponentType][],
];

export type ComponentType = (typeof SUPPORTED_COMPONENT_TYPES)[number];

