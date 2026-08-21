import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CropStep } from "./CropStep";

describe("CropStep", () => {
  it("renders the previously selected crop corners", () => {
    const initialCorners: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ] = [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.3 },
      { x: 0.9, y: 0.9 },
      { x: 0.2, y: 0.85 },
    ];

    render(
      <CropStep
        imageUrl="https://example.com/ticket.jpg"
        initialCorners={initialCorners}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole("button", { name: /esquina:/i });

    expect(handles[0].style.left).toBe("10%");
    expect(handles[0].style.top).toBe("20%");
    expect(handles[1].style.left).toBe("80%");
    expect(handles[1].style.top).toBe("30%");
  });

});
