import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { SingleSelectDropdown } from "./SingleSelectDropdown";

const OPTIONS = [
  { label: "Standard", value: "STANDARD" },
  { label: "Intro", value: "INTRO" },
];

function renderSelect(overrides: Partial<Parameters<typeof SingleSelectDropdown>[0]> = {}) {
  const onChange = jest.fn();
  const props = {
    controlLabel: "Category",
    name: "category",
    onChange,
    options: OPTIONS,
    placeholder: "Select an option",
    testId: "discount-category",
    value: "",
    ...overrides,
  };

  render(<SingleSelectDropdown {...props} />);

  return { onChange };
}

function control() {
  return screen.getByTestId("discount-category").querySelector("input")!;
}

describe("SingleSelectDropdown", () => {
  it("shows the placeholder until a choice is made", () => {
    renderSelect();

    expect(control()).toHaveAttribute("placeholder", "Select an option");
    expect(control()).toHaveValue("");
  });

  it("shows the selected option's label rather than its value", () => {
    renderSelect({ value: "STANDARD" });

    expect(control()).toHaveValue("Standard");
  });

  it("lists every option once opened", () => {
    renderSelect();

    fireEvent.click(control());

    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
  });

  it("opens without a search field", () => {
    renderSelect();

    fireEvent.click(control());

    expect(screen.queryByPlaceholderText("Find")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-icon")).not.toBeInTheDocument();
  });

  it("reports the chosen value", () => {
    const { onChange } = renderSelect();

    fireEvent.click(control());
    fireEvent.click(screen.getByText("Intro"));

    expect(onChange).toHaveBeenCalledWith("INTRO");
  });

  it("keeps the control read-only so the list is the only way in", () => {
    renderSelect();

    expect(control()).toHaveAttribute("readonly");
  });

  it("renders the error message the step hands down", () => {
    renderSelect({ errorMessage: "A category is required." });

    expect(
      within(screen.getByTestId("discount-category")).getByText("A category is required."),
    ).toBeInTheDocument();
  });
});
