import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Highlight from "../Highlight";

describe("Highlight", () => {
  it("marks the offsets", () => {
    const { container } = render(<Highlight text="Proof of possession" matches={[{ start: 0, end: 5 }]} />);
    expect(container.querySelector("mark")).toHaveTextContent("Proof");
    expect(container).toHaveTextContent("Proof of possession");
  });
  it("renders HTML-looking text as inert text", () => {
    const { container } = render(<Highlight text="<img src=x onerror=alert(1)>" matches={[{ start: 0, end: 4 }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img", { exact: false })).toBeInTheDocument();
  });
  it("ignores out-of-range or overlapping offsets", () => {
    const { container } = render(<Highlight text="abc" matches={[{ start: 0, end: 2 }, { start: 1, end: 3 }, { start: 2, end: 99 }]} />);
    expect(container).toHaveTextContent("abc");
  });
});
