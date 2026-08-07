import { z } from "zod";

export const siteStatuses = ["active", "inactive", "closed"] as const;

export const siteStatusLabels: Record<(typeof siteStatuses)[number], string> = {
  active: "Active",
  inactive: "Inactive",
  closed: "Closed",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const coordinates = {
  latitude: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(-90, "Latitude runs from −90 to 90.").max(90, "Latitude runs from −90 to 90.").optional(),
  ),
  longitude: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(-180, "Longitude runs from −180 to 180.").max(180, "Longitude runs from −180 to 180.").optional(),
  ),
};

/** The database stores both coordinates or neither, so the form has to ask for them as a pair. */
const bothOrNeitherCoordinate = (value: { latitude?: number; longitude?: number }) =>
  (value.latitude === undefined) === (value.longitude === undefined);

export const siteSchema = z
  .object({
    name: z.string().trim().min(2, "Name the mine site.").max(120),
    countryCode: z.string().trim().length(2, "Use a two letter country code.").toUpperCase(),
    region: z.string().trim().max(120).optional(),
    district: z.string().trim().max(120).optional(),
    ...coordinates,
  })
  .refine(bothOrNeitherCoordinate, {
    message: "Give both a latitude and a longitude, or leave both empty.",
    path: ["longitude"],
  });

export const siteEditSchema = z
  .object({
    siteId: z.string().uuid(),
    name: z.string().trim().min(2, "Name the mine site.").max(120),
    countryCode: z.string().trim().length(2, "Use a two letter country code.").toUpperCase(),
    region: z.string().trim().max(120).optional(),
    district: z.string().trim().max(120).optional(),
    status: z.enum(siteStatuses),
    ...coordinates,
  })
  .refine(bothOrNeitherCoordinate, {
    message: "Give both a latitude and a longitude, or leave both empty.",
    path: ["longitude"],
  });

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Name the organization.").max(120),
  countryCode: z.string().trim().length(2, "Use a two letter country code.").toUpperCase(),
});
