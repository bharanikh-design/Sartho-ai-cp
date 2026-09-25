import { FrontDoor } from "@/components/landing/front-door";

/*
 * The front door, and only the front door.
 *
 * The signed-out home is the hero — brand, promise, what the product does in
 * three lines, and the way in — with the global site footer beneath it. The
 * longer explainer that used to sit under it (product carousel, feature grid,
 * the "what it will not do" panel) has been removed at the product owner's
 * request.
 *
 * The page is still not a bare login form, which is what Google's OAuth brand
 * verification rejects: the hero states what Sartho is (headline, lead and the
 * three capability lines) and the footer carries Privacy and Terms. If brand
 * verification ever asks for more prose again, the explainer sections are in
 * git history and drop straight back in beneath <FrontDoor />.
 */
export function SignedOutHome() {
  return <FrontDoor />;
}
