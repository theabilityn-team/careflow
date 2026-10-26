import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../client/src/components/ui/alert-dialog", () => {
  const box = ({ children, onOpenChange, ...props }: any) => React.createElement("div", props, children);
  const button = ({ children, ...props }: any) => React.createElement("button", props, children);
  return { AlertDialog: ({ open, children }: any) => open ? React.createElement("div", {}, children) : null, AlertDialogAction: button, AlertDialogCancel: button, AlertDialogContent: box, AlertDialogDescription: box, AlertDialogFooter: box, AlertDialogHeader: box, AlertDialogTitle: box };
});
import { SalesDeleteDialog, SalesDeleteButton } from "../client/src/components/crm/SalesDeleteDialog";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const callbacks = { onConfirm: vi.fn(), onCancel: vi.fn() };
describe("explicit scoped sales deletion confirmation", () => {
  it("warns about all customer orders and explicitly preserves the original lead", () => {
    const html = renderToStaticMarkup(React.createElement(SalesDeleteDialog, { ...callbacks, deleting: false, target: { kind: "customer", id: 1, name: "Example Customer", orderCount: 103, leadId: 12 } }));
    expect(html).toContain("all 103 associated orders");
    expect(html).toContain("Lead #12");
    expect(html).toContain("remain unchanged");
    expect(html).toContain("Audit history is preserved");
    expect(html).toContain("Delete customer &amp; orders");
  });
  it("limits individual order deletion and disables dismissal/double submission while pending", () => {
    const html = renderToStaticMarkup(React.createElement(SalesDeleteDialog, { ...callbacks, deleting: true, target: { kind: "order", id: 2, name: "CF-000002", customerId: 1 } }));
    expect(html).toContain("only this order");
    expect(html).toContain("other orders remain unchanged");
    expect(html).toContain("Deleting…");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it("has clear empty-customer label and visible retryable error, and renders no closed dialog", () => {
    const target = { kind: "customer" as const, id: 1, name: "Example Customer", orderCount: 0, leadId: 12 };
    const html = renderToStaticMarkup(React.createElement(SalesDeleteDialog, { ...callbacks, deleting: false, error: "Please try again.", target }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Please try again.");
    expect(html).not.toContain("Delete customer &amp; orders");
    expect(renderToStaticMarkup(React.createElement(SalesDeleteDialog, { ...callbacks, deleting: false, target: null }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(SalesDeleteButton, { kind: "order", onClick: vi.fn() }))).toContain("Delete order");
  });
});
