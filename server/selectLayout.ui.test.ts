import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../client/src/components/ui/select";
import { SelectIdentity } from "../client/src/components/crm/SelectIdentity";

vi.stubGlobal("React", React);
afterEach(() => vi.clearAllMocks());

function renderSelector(className?: string) {
  return renderToStaticMarkup(
    React.createElement(
      Select,
      { value: "lead" },
      React.createElement(
        SelectTrigger,
        { className },
        React.createElement(
          SelectValue,
          null,
          React.createElement(SelectIdentity, {
            name: "A very long customer name",
            email: "unbroken.email.address@example.invalid",
          })
        )
      ),
      React.createElement(
        SelectContent,
        null,
        React.createElement(
          SelectItem,
          {
            value: "lead",
            textValue: "A very long customer name unbroken.email.address@example.invalid",
          },
          React.createElement(SelectIdentity, {
            name: "A very long customer name",
            email: "unbroken.email.address@example.invalid",
          })
        )
      )
    )
  );
}

describe("shared selector layout", () => {
  it("uses full-width, wrapping defaults and viewport-safe intrinsic popup sizing", () => {
    const html = renderSelector();

    expect(html).toContain("w-full");
    expect(html).toContain("line-clamp-none");
    expect(html).toContain("whitespace-normal");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("min-h-11");
    expect(html).toContain("md:data-[size=default]:min-h-9");
    expect(html).toContain("break-words");
    expect(html).toContain("unbroken.email.address@example.invalid");
  });

  it("renders identity values as separate name and email lines", () => {
    const html = renderSelector();

    expect(html).toContain("flex-col");
    expect(html).toContain(">A very long customer name</span>");
    expect(html).toContain(">unbroken.email.address@example.invalid</span>");
    expect(html).not.toContain("truncate");
  });

  it("keeps explicit compact caller widths for currency and page-size selectors", () => {
    const currency = renderSelector("w-[92px] shrink-0");
    const pageSize = renderSelector("w-[120px]");

    expect(currency).toContain("w-[92px]");
    expect(currency).toContain("shrink-0");
    expect(pageSize).toContain("w-[120px]");
  });
});
