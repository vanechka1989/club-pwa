import type {
  AcquisitionAttribution,
  AcquisitionDestination,
  AcquisitionTouch,
  AdminAcquisitionDashboard,
  AdminAcquisitionLink,
  AdminUserAcquisition
} from "@club/shared";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  acquisitionLinks,
  acquisitionVisitors,
  acquisitionVisits,
  paymentOrders,
  userAcquisitionAttributions,
  users
} from "../db/schema";
import { destinationFromLink } from "./acquisitionStore";

type AnalyticsLink = {
  id: string;
  aid: string;
  name: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  destination: AcquisitionDestination;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AnalyticsVisit = { id: string; visitorHash: string; linkId: string; userId: string | null; occurredAt: Date };
type AnalyticsAttribution = { userId: string; firstLinkId: string; lastLinkId: string; registeredAt: Date };
type AnalyticsOrder = { userId: string; status: string; amountRub: number; paidAt: Date | null };

type AnalyticsData = {
  links: AnalyticsLink[];
  visits: AnalyticsVisit[];
  attributions: AnalyticsAttribution[];
  orders: AnalyticsOrder[];
};

type DashboardOptions = {
  attribution: AcquisitionAttribution;
  from: Date | null;
  to: Date | null;
  origin: string;
};

const inPeriod = (date: Date | null, from: Date | null, to: Date | null) =>
  Boolean(date && (!from || date >= from) && (!to || date <= to));

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const rate = (value: number, total: number) => (total ? Math.round((value / total) * 10_000) / 100 : 0);

function makeTrackedUrl(origin: string, link: AnalyticsLink) {
  const url = new URL("/", origin);
  url.searchParams.set("aid", link.aid);
  url.searchParams.set("utm_source", link.source);
  url.searchParams.set("utm_medium", link.medium);
  url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  return url.toString();
}

function touch(link: AnalyticsLink | undefined, visitedAt: Date | undefined): AcquisitionTouch | null {
  if (!link || !visitedAt) return null;
  return {
    linkId: link.id,
    aid: link.aid,
    linkName: link.name,
    source: link.source,
    medium: link.medium,
    campaign: link.campaign,
    content: link.content,
    visitedAt: visitedAt.toISOString()
  };
}

export function buildAcquisitionDashboard(data: AnalyticsData, options: DashboardOptions): AdminAcquisitionDashboard {
  const linksById = new Map(data.links.map((link) => [link.id, link]));
  const periodVisits = data.visits.filter((visit) => inPeriod(visit.occurredAt, options.from, options.to));
  const periodAttributions = data.attributions.filter((item) => inPeriod(item.registeredAt, options.from, options.to));
  const attributedLinkId = (item: AnalyticsAttribution) =>
    options.attribution === "first" ? item.firstLinkId : item.lastLinkId;
  const firstPaidByUser = new Map<string, AnalyticsOrder>();
  for (const order of data.orders.filter((item) => item.status === "paid" && item.paidAt).sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())) {
    if (!firstPaidByUser.has(order.userId)) firstPaidByUser.set(order.userId, order);
  }
  const periodPaidUsers = new Set(
    [...firstPaidByUser.values()].filter((order) => inPeriod(order.paidAt, options.from, options.to)).map((order) => order.userId)
  );
  const periodOrders = data.orders.filter((order) => order.status === "paid" && inPeriod(order.paidAt, options.from, options.to));
  const attributionByUser = new Map(data.attributions.map((item) => [item.userId, item]));

  const rows = (dimension: "source" | "campaign") => {
    const keys = new Map<string, { label: string; visits: number; registrations: number; overlapRegistrations: number; paidUsers: Set<string>; revenueRub: number }>();
    const rowFor = (link: AnalyticsLink) => {
      const key = link[dimension] || "direct";
      const current = keys.get(key) ?? { label: key, visits: 0, registrations: 0, overlapRegistrations: 0, paidUsers: new Set<string>(), revenueRub: 0 };
      keys.set(key, current);
      return current;
    };
    for (const visit of periodVisits) {
      const link = linksById.get(visit.linkId);
      if (link) rowFor(link).visits += 1;
    }
    for (const item of periodAttributions) {
      const link = linksById.get(attributedLinkId(item));
      if (link) rowFor(link).registrations += 1;
      const firstLink = linksById.get(item.firstLinkId);
      const lastLink = linksById.get(item.lastLinkId);
      if (firstLink && lastLink && firstLink[dimension] === lastLink[dimension]) {
        rowFor(firstLink).overlapRegistrations += 1;
      }
    }
    for (const userId of periodPaidUsers) {
      const item = attributionByUser.get(userId);
      const link = item ? linksById.get(attributedLinkId(item)) : undefined;
      if (link) rowFor(link).paidUsers.add(userId);
    }
    for (const order of periodOrders) {
      const item = attributionByUser.get(order.userId);
      const link = item ? linksById.get(attributedLinkId(item)) : undefined;
      if (link) rowFor(link).revenueRub += order.amountRub;
    }
    return [...keys.entries()]
      .map(([key, value]) => ({ key, label: value.label, visits: value.visits, registrations: value.registrations, overlapRegistrations: value.overlapRegistrations, paidUsers: value.paidUsers.size, revenueRub: value.revenueRub }))
      .sort((a, b) => b.revenueRub - a.revenueRub || b.registrations - a.registrations || b.visits - a.visits);
  };

  const timeline = new Map<string, { date: string; visits: number; registrations: number; paidUsers: number; revenueRub: number }>();
  const timelineRow = (date: Date) => {
    const key = dateKey(date);
    const current = timeline.get(key) ?? { date: key, visits: 0, registrations: 0, paidUsers: 0, revenueRub: 0 };
    timeline.set(key, current);
    return current;
  };
  periodVisits.forEach((visit) => (timelineRow(visit.occurredAt).visits += 1));
  periodAttributions.forEach((item) => (timelineRow(item.registeredAt).registrations += 1));
  [...firstPaidByUser.values()].filter((order) => inPeriod(order.paidAt, options.from, options.to)).forEach((order) => (timelineRow(order.paidAt!).paidUsers += 1));
  periodOrders.forEach((order) => (timelineRow(order.paidAt!).revenueRub += order.amountRub));

  const serializeLink = (link: AnalyticsLink): AdminAcquisitionLink => {
    const linkVisits = periodVisits.filter((visit) => visit.linkId === link.id);
    const registrations = periodAttributions.filter((item) => attributedLinkId(item) === link.id).length;
    const paidUsers = [...periodPaidUsers].filter((userId) => {
      const item = attributionByUser.get(userId);
      return item && attributedLinkId(item) === link.id;
    });
    const revenueRub = periodOrders.reduce((sum, order) => {
      const item = attributionByUser.get(order.userId);
      return sum + (item && attributedLinkId(item) === link.id ? order.amountRub : 0);
    }, 0);
    return {
      ...link,
      url: makeTrackedUrl(options.origin, link),
      visits: linkVisits.length,
      uniqueVisitors: new Set(linkVisits.map((visit) => visit.visitorHash)).size,
      registrations,
      paidUsers: paidUsers.length,
      revenueRub,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString()
    };
  };

  const registrations = periodAttributions.length;
  const uniqueVisitors = new Set(periodVisits.map((visit) => visit.visitorHash)).size;
  return {
    attribution: options.attribution,
    period: { from: options.from?.toISOString() ?? null, to: options.to?.toISOString() ?? null },
    summary: {
      visits: periodVisits.length,
      uniqueVisitors,
      registrations,
      paidUsers: periodPaidUsers.size,
      revenueRub: periodOrders.reduce((sum, order) => sum + order.amountRub, 0),
      visitToRegistrationRate: rate(registrations, uniqueVisitors),
      registrationToPaidRate: rate(periodPaidUsers.size, registrations),
      visitToPaidRate: rate(periodPaidUsers.size, uniqueVisitors)
    },
    timeline: [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sources: rows("source"),
    campaigns: rows("campaign"),
    topLinks: data.links.map(serializeLink).sort((a, b) => b.revenueRub - a.revenueRub || b.registrations - a.registrations || b.visits - a.visits)
  };
}

export function buildUserAcquisition(input: {
  user: { id: string; createdAt: Date };
  links: AnalyticsLink[];
  visits: AnalyticsVisit[];
  attribution: AnalyticsAttribution | null;
  orders: AnalyticsOrder[];
}): AdminUserAcquisition {
  const links = new Map(input.links.map((link) => [link.id, link]));
  const sortedVisits = [...input.visits].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const firstVisit = input.attribution ? sortedVisits.find((visit) => visit.linkId === input.attribution!.firstLinkId) : undefined;
  const lastVisit = input.attribution ? [...sortedVisits].reverse().find((visit) => visit.linkId === input.attribution!.lastLinkId) : undefined;
  const paidOrders = input.orders.filter((order) => order.userId === input.user.id && order.status === "paid" && order.paidAt);
  const firstPaidAt = paidOrders.sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())[0]?.paidAt ?? null;
  const registeredAt = input.attribution?.registeredAt ?? input.user.createdAt;
  return {
    firstTouch: touch(input.attribution ? links.get(input.attribution.firstLinkId) : undefined, firstVisit?.occurredAt),
    lastTouch: touch(input.attribution ? links.get(input.attribution.lastLinkId) : undefined, lastVisit?.occurredAt),
    registeredAt: registeredAt.toISOString(),
    firstPaidAt: firstPaidAt?.toISOString() ?? null,
    registrationDelaySeconds: firstVisit ? Math.max(0, Math.round((registeredAt.getTime() - firstVisit.occurredAt.getTime()) / 1000)) : null,
    firstPaymentDelaySeconds: firstPaidAt ? Math.max(0, Math.round((firstPaidAt.getTime() - registeredAt.getTime()) / 1000)) : null,
    paidOrders: paidOrders.length,
    revenueRub: paidOrders.reduce((sum, order) => sum + order.amountRub, 0),
    visits: sortedVisits.map((visit) => touch(links.get(visit.linkId), visit.occurredAt)).filter((item): item is AcquisitionTouch => Boolean(item)).reverse()
  };
}

async function loadAnalyticsData(): Promise<AnalyticsData> {
  const [linkRows, visitRows, attributionRows, orderRows] = await Promise.all([
    db.select().from(acquisitionLinks).orderBy(asc(acquisitionLinks.createdAt)),
    db.select({ id: acquisitionVisits.id, visitorHash: acquisitionVisitors.visitorHash, linkId: acquisitionVisits.linkId, userId: acquisitionVisits.userId, occurredAt: acquisitionVisits.occurredAt })
      .from(acquisitionVisits).innerJoin(acquisitionVisitors, eq(acquisitionVisits.visitorId, acquisitionVisitors.id)),
    db.select().from(userAcquisitionAttributions),
    db.select({ userId: paymentOrders.userId, status: paymentOrders.status, amountRub: paymentOrders.amountRub, paidAt: paymentOrders.paidAt }).from(paymentOrders)
  ]);
  return {
    links: linkRows.map((link) => ({ ...link, destination: destinationFromLink(link) })),
    visits: visitRows,
    attributions: attributionRows.map((item) => ({ userId: item.userId, firstLinkId: item.firstLinkId, lastLinkId: item.lastLinkId, registeredAt: item.registeredAt })),
    orders: orderRows
  };
}

export async function getAcquisitionDashboard(options: DashboardOptions) {
  return buildAcquisitionDashboard(await loadAnalyticsData(), options);
}

export async function listAcquisitionLinks(origin: string) {
  return (await getAcquisitionDashboard({ attribution: "last", from: null, to: null, origin })).topLinks;
}

export async function getUserAcquisition(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;
  const data = await loadAnalyticsData();
  return buildUserAcquisition({
    user,
    links: data.links,
    visits: data.visits.filter((visit) => visit.userId === userId),
    attribution: data.attributions.find((item) => item.userId === userId) ?? null,
    orders: data.orders.filter((order) => order.userId === userId)
  });
}
