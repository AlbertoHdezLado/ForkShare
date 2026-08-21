import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS } from "@/lib/receipt/editable";
import { ReceiptEditor } from "./ReceiptEditor";

describe("ReceiptEditor", () => {
  it("adds a new item without forcing quantity to 1", () => {
    const onItemsChange = vi.fn();

    render(
      <ReceiptEditor
        items={[]}
        extras={EMPTY_EXTRAS}
        onItemsChange={onItemsChange}
        onExtrasChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /agregar producto/i }));

    expect(onItemsChange).toHaveBeenCalledTimes(1);
    const [item] = onItemsChange.mock.calls[0][0];
    expect(item.quantity).toBe(0);
  });
});
