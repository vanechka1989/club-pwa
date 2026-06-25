import type { ClubUser } from "@club/shared";

export function shouldShowAccessClosedAlert(previousUser: ClubUser | null, nextUser: ClubUser | null) {
  return previousUser?.membershipStatus === "active" && nextUser?.membershipStatus !== "active";
}

export function shouldShowAccessGrantedAlert(previousUser: ClubUser | null, nextUser: ClubUser | null) {
  return Boolean(previousUser && previousUser.membershipStatus !== "active" && nextUser?.membershipStatus === "active");
}
