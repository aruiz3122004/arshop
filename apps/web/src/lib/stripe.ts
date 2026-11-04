import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      "pk_test_51TG1dLB1nm2xbNeisUoyDQ0JkArxCwAfwMwDMExAK950ZKj8RIiSwFZvZNORx0sVDSBSvgjzmcifDu8DxSCRkQCh00jXf6kJvo";
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
