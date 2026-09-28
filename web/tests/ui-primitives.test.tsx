// Primitivas M3E: contrato que observa un consumidor —la superficie que pinta
// cada variante, que `disabled` bloquee el click, el enlace etiqueta/ayuda/error
// de los campos y el menú del botón dividido—, no el detalle de su piel.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SplitButton,
} from "../src/components/ui";

afterEach(cleanup);

describe("Button", () => {
  it("es type=button por defecto (no envía formularios sin querer)", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("respeta un type explícito", () => {
    render(<Button type="submit">Entrar</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("disabled no dispara onClick", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Registrar sesión
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cada variante pinta una superficie distinta", () => {
    const seen = new Set<string>();
    const { rerender } = render(<Button>Uno</Button>);
    for (const variant of [
      "filled",
      "tonal",
      "outlined",
      "text",
      "danger",
    ] as const) {
      rerender(<Button variant={variant}>Uno</Button>);
      seen.add(screen.getByRole("button").className);
    }
    expect(seen.size).toBe(5);
  });
});

describe("Field", () => {
  it("la etiqueta nombra el campo y la ayuda lo describe", () => {
    render(
      <Field label="Nombre" support="Visible en el recetario">
        {(a) => <Input {...a} />}
      </Field>,
    );
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(
      document.getElementById(input.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Visible en el recetario");
  });

  it("con error marca aria-invalid y el error sustituye a la ayuda", () => {
    render(
      <Field label="Nombre" support="Ayuda" error="Obligatorio">
        {(a) => <Input {...a} />}
      </Field>,
    );
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(input.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Obligatorio");
    expect(screen.queryByText("Ayuda")).toBeNull();
  });
});

describe("SplitButton", () => {
  it("la flecha abre un menú; elegir una variante la ejecuta y lo cierra", () => {
    const main = vi.fn();
    const other = vi.fn();
    render(
      <SplitButton
        onClick={main}
        menuLabel="Más formas de guardar"
        items={[{ label: "Guardar y otra", onSelect: other }]}
      >
        Guardar
      </SplitButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(main).toHaveBeenCalledTimes(1);
    const arrow = screen.getByRole("button", { name: "Más formas de guardar" });
    fireEvent.click(arrow);
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Guardar y otra" }));
    expect(other).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape cierra el menú y devuelve el foco a la flecha", () => {
    render(
      <SplitButton
        onClick={() => {}}
        menuLabel="Más"
        items={[{ label: "Otra", onSelect: () => {} }]}
      >
        Guardar
      </SplitButton>,
    );
    const arrow = screen.getByRole("button", { name: "Más" });
    fireEvent.click(arrow);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(arrow);
  });
});

describe("Badge", () => {
  it("cada tono pinta una superficie distinta", () => {
    const { rerender } = render(<Badge tone="pending">Pendiente</Badge>);
    expect(screen.getByText("Pendiente").className).toContain("badge-pending");
    rerender(<Badge tone="done">Hecho</Badge>);
    expect(screen.getByText("Hecho").className).toContain("badge-done");
    rerender(<Badge>Neutro</Badge>);
    expect(screen.getByText("Neutro").className).toContain("badge-neutral");
  });
});

describe("Card", () => {
  it("añade la superficie de tarjeta y conserva las clases del consumidor", () => {
    render(<Card className="extra">Contenido</Card>);
    const card = screen.getByText("Contenido");
    expect(card.className).toContain("card");
    expect(card.className).toContain("extra");
  });
});
