import { Inngest } from "inngest";

/**
 * The one Inngest client for the app. Keys (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY) are read from the
 * environment by the SDK; nothing secret is passed through events.
 *
 * Dev mode is opt-in and never allowed in production: a production build must talk to Inngest Cloud and
 * verify request signatures, so a missing key fails loudly instead of silently running unsigned.
 */
const devMode = process.env.NODE_ENV !== "production" && Boolean(process.env.INNGEST_DEV);

export const inngest = new Inngest({ id: "generalmind-gtm-radar", isDev: devMode });
