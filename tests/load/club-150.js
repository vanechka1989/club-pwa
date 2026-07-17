import http from "k6/http";
import { check, group, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const sessionCookies = (__ENV.SESSION_COOKIES || "").split(",").map((value) => value.trim()).filter(Boolean);
const fullStages = [
  { duration: "2m", target: 50 },
  { duration: "3m", target: 100 },
  { duration: "5m", target: 150 },
  { duration: "15m", target: 150 },
  { duration: "3m", target: 0 }
];
const smokeStages = [
  { duration: "10s", target: 5 },
  { duration: "30s", target: 5 },
  { duration: "10s", target: 0 }
];
const production100Stages = [
  { duration: "1m", target: 25 },
  { duration: "1m", target: 50 },
  { duration: "1m", target: 75 },
  { duration: "2m", target: 100 },
  { duration: "5m", target: 100 },
  { duration: "1m", target: 0 }
];
const selectedStages = __ENV.LOAD_PROFILE === "smoke"
  ? smokeStages
  : __ENV.LOAD_PROFILE === "production-100"
    ? production100Stages
    : fullStages;

export const options = {
  stages: selectedStages,
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<500', 'p(99)<1500']
  },
  userAgent: "Club-PWA-capacity-test/1.0"
};

export function setup() {
  if (!sessionCookies.length) throw new Error("SESSION_COOKIES must contain at least one valid club_session token");
  if (baseUrl.includes("club2.myn8nservertest.ru") && __ENV.CONFIRM_PRODUCTION_LOAD !== "YES") {
    throw new Error("Set CONFIRM_PRODUCTION_LOAD=YES explicitly before running against production");
  }
}

function request(path) {
  const token = sessionCookies[(__VU - 1) % sessionCookies.length];
  const response = http.get(`${baseUrl}${path}`, {
    headers: {
      Cookie: `club_session=${token}`,
      "X-Club-PWA-Standalone": "1"
    },
    tags: { endpoint: path }
  });
  check(response, { [`${path} is successful`]: (result) => result.status >= 200 && result.status < 300 });
}

export default function () {
  group("profile", () => request("/api/me"));
  sleep(Math.random() * 2 + 1);
  group("notifications", () => request("/api/notifications"));
  group("support unread", () => request("/api/support/unread"));
  sleep(Math.random() * 2 + 1);
  group("community topics", () => request("/api/community/topics"));
  sleep(Math.random() * 3 + 2);
}
