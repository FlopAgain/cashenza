export function isBillingTestMode() {
  return process.env.NODE_ENV !== "production";
}

export function buildStarterBillingFailureResponse(
  redirect: (url: string, init?: any) => Response,
) {
  return async () => redirect("/app/billing", { target: "_parent" });
}
