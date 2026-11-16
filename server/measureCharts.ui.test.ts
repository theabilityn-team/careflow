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
});
