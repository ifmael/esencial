// Primitivas de UI (variante A): contrato de variantes/tonos y comportamiento
// del botón. Lo que se prueba es lo que un consumidor observa —la superficie
// que pinta cada variante, que `disabled` bloquee el click y que los campos
// expongan su estado de error—, no el detalle interno del componente.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge, Button, Card, Input } from "../src/components/ui";

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
    const { rerender } = render(<Button>Uno</Button>);
    const primary = screen.getByRole("button").className;
    rerender(<Button variant="secondary">Uno</Button>);
    const secondary = screen.getByRole("button").className;
    rerender(<Button variant="ghost">Uno</Button>);
    const ghost = screen.getByRole("button").className;
    expect(primary).not.toBe(secondary);
    expect(secondary).not.toBe(ghost);
    expect(secondary).toContain("btn-secondary");
    expect(ghost).toContain("btn-ghost");
  });

  it("size sm reduce la altura y size md la mantiene en área táctil", () => {
    const { rerender } = render(<Button size="sm">Uno</Button>);
    expect(screen.getByRole("button").className).toContain("h-9");
    rerender(<Button>Uno</Button>);
    expect(screen.getByRole("button").className).toContain("h-11");
  });
});

describe("Input", () => {
  it("marca el estado de error con aria-invalid y la superficie de error", () => {
    render(<Input aria-label="Contraseña" aria-invalid />);
    const input = screen.getByLabelText("Contraseña");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("input-error");
  });

  it("sin error no pinta la superficie de error", () => {
    render(<Input aria-label="Contraseña" />);
    expect(screen.getByLabelText("Contraseña").className).not.toContain(
      "input-error",
    );
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
