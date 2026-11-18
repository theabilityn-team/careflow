import { describe, expect, it } from "vitest";
import { measureChartData } from "../client/src/components/crm/MeasureCharts";
import { emptyMetrics } from "./measureAnalytics";
const point = (at: number, observed = true) => ({ key: String(at), label: `hour-${at}`, from: at, to: at + 1, metrics: { ...emptyMetrics(), activeMinutes: 10, inactiveMinutes: 5, leadOpens: 2, statusChanges: 3, contactsLogged: 4, emailsSent: 5, ordersEntered: 6 }, observed });
describe("Measure chart series", () => {
  it("sorts chart slots chronologically and retains separate action lines", () => {
    const data = measureChartData([point(2), point(1)]);
    expect(data.map(p => p.from)).toEqual([1, 2]);
    expect(data[0]).toMatchObject({ active: 10, idle: 5, leadOpens: 2, statuses: 3, contacts: 4, emails: 5, orders: 6 });
  });
  it("displays observed zero activity as zero, not a missing chart", () => {
    const data = measureChartData([{ ...point(1), metrics: emptyMetrics() }]);
    for (const key of ["active", "idle", "leadOpens", "statuses", "contacts", "emails", "orders"] as const) expect(data[0][key]).toBe(0);
  });
  it("never draws a fabricated value for future hours or days", () => {
    const data = measureChartData([point(1, false)]);
    for (const key of ["active", "idle", "leadOpens", "statuses", "contacts", "emails", "orders"] as const) expect(data[0][key]).toBeNull();
  });
  it("converts only active and idle minutes to the selected unit", () => {
    const data = measureChartData([point(1)], "hours");
    expect(data[0]).toMatchObject({ active: 10 / 60, idle: 5 / 60, leadOpens: 2, statuses: 3, contacts: 4, emails: 5, orders: 6 });

    const dailyData = measureChartData([point(1)], "days");
    expect(dailyData[0]).toMatchObject({ active: 10 / 1440, idle: 5 / 1440, leadOpens: 2, statuses: 3, contacts: 4, emails: 5, orders: 6 });
  });
  it("does not mutate source points or their metric values", () => {
    const points = [point(2), point(1, false)];
    const before = structuredClone(points);
    measureChartData(points, "days");
    expect(points).toEqual(before);
  });
  it("preserves observed zeroes and future nulls after conversion", () => {
    const data = measureChartData([{ ...point(1), metrics: emptyMetrics() }, point(2, false)], "hours");
    expect(data[0]).toMatchObject({ active: 0, idle: 0, leadOpens: 0, statuses: 0, contacts: 0, emails: 0, orders: 0 });
    for (const key of ["active", "idle", "leadOpens", "statuses", "contacts", "emails", "orders"] as const) expect(data[1][key]).toBeNull();
  });
});
